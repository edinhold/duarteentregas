// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const ONESIGNAL_APP_ID = "52d432a9-3b18-428f-ab87-eff19a2d5a6a";
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY")!;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sendOneSignal(externalIds: string[], payloadData: any) {
  const fee = Number(payloadData.driver_fee ?? 0).toFixed(2);
  const subtitle =
    `R$ ${fee} • ${payloadData.pickup_address ?? ""} → ${payloadData.delivery_address ?? ""}`;
  const payload = {
    app_id: ONESIGNAL_APP_ID,
    target_channel: "push",
    include_aliases: { external_id: externalIds },
    headings: { en: "🚚 Nova entrega disponível", pt: "🚚 Nova entrega disponível" },
    contents: {
      en: `Você possui uma nova entrega aguardando aceite. ${subtitle}`,
      pt: `Você possui uma nova entrega aguardando aceite. ${subtitle}`,
    },
    data: {
      pedido_id: payloadData.request_id,
      tipo: "nova_entrega",
      rota: "/motorista/pedido",
      request_id: payloadData.request_id,
      driver_fee: payloadData.driver_fee,
      pickup_address: payloadData.pickup_address,
      delivery_address: payloadData.delivery_address,
      url: "/motorista/pedido",
    },
    url: "/motorista/pedido",
    priority: 10,
    ttl: 120,
    android_channel_id: undefined,
    android_visibility: 1,
    android_accent_color: "FF2563EB",
  };

  return await fetch("https://api.onesignal.com/notifications?c=push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
}

async function sendWithRetry(externalIds: string[], payloadData: any) {
  let lastErr: any = null;
  let lastJson: any = null;
  let lastStatus = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await sendOneSignal(externalIds, payloadData);
      lastStatus = res.status;
      lastJson = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, attempts: attempt, json: lastJson, status: res.status };
      console.warn("[PushNotifications] attempt", attempt, "failed", res.status, lastJson);
    } catch (e) {
      lastErr = e;
      console.warn("[PushNotifications] attempt", attempt, "threw", e);
    }
    // backoff: 300ms, 900ms
    await new Promise((r) => setTimeout(r, 300 * Math.pow(3, attempt - 1)));
  }
  return {
    ok: false,
    attempts: 3,
    json: lastJson,
    status: lastStatus,
    error: lastErr ? String(lastErr) : undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      request_id,
      driver_id,
      driver_fee,
      pickup_address,
      delivery_address,
    } = body ?? {};

    if (!request_id) {
      return new Response(JSON.stringify({ error: "missing request_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Identify target drivers
    let externalIds: string[] = [];
    if (driver_id) {
      externalIds = [driver_id];
    } else {
      const { data: drivers, error } = await supabase
        .from("drivers")
        .select("user_id, is_online, is_active, last_seen_at")
        .eq("is_online", true)
        .eq("is_active", true);
      if (error) console.error("[PushNotifications] drivers query error", error);

      const cutoff = Date.now() - 5 * 60 * 1000;
      externalIds = (drivers ?? [])
        .filter((d: any) => !d.last_seen_at || new Date(d.last_seen_at).getTime() > cutoff)
        .map((d: any) => d.user_id)
        .filter(Boolean);
    }

    console.log("[PushNotifications] targets", externalIds.length, { request_id });

    if (externalIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no_online_drivers" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduplicate: drop any driver who already has a log row for this request
    const { data: existing } = await supabase
      .from("push_notification_logs")
      .select("driver_user_id")
      .eq("request_id", request_id)
      .in("driver_user_id", externalIds);
    const already = new Set((existing ?? []).map((r: any) => r.driver_user_id));
    const targets = externalIds.filter((id) => !already.has(id));

    if (targets.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, reason: "already_notified", duplicates: externalIds.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await sendWithRetry(targets, {
      request_id,
      driver_fee,
      pickup_address,
      delivery_address,
    });

    // Log per-driver (insert; unique constraint guarantees no duplicate)
    const rows = targets.map((uid) => ({
      request_id,
      driver_user_id: uid,
      status: result.ok ? "sent" : "failed",
      attempts: result.attempts,
      response: result.json ?? null,
      error: result.ok ? null : (result.error ?? `http_${result.status}`),
    }));
    const { error: logErr } = await supabase
      .from("push_notification_logs")
      .insert(rows);
    if (logErr) console.error("[PushNotifications] log insert error", logErr);

    if (!result.ok) {
      console.error("[PushNotifications] all attempts failed", result.status, result.json);
      return new Response(
        JSON.stringify({ error: result.json, status: result.status, attempts: result.attempts }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[PushNotifications] sent", { request_id, count: targets.length, attempts: result.attempts });
    return new Response(
      JSON.stringify({ sent: targets.length, attempts: result.attempts, onesignal: result.json }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[PushNotifications] handler error", err);
    return new Response(JSON.stringify({ error: err?.message ?? "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
