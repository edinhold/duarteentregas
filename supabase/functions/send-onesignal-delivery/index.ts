// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const ONESIGNAL_APP_ID = "52d432a9-3b18-428f-ab87-eff19a2d5a6a";
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY")!;
// Optional: OneSignal Android Notification Category UUID (created in dashboard or via REST).
// If unset, OneSignal uses the default high-importance channel "Miscellaneous".
const ONESIGNAL_ANDROID_CHANNEL_ID = Deno.env.get("ONESIGNAL_ANDROID_CHANNEL_ID") || undefined;
// Optional: iOS APNs Notification Category for action buttons/critical sound config.
const ONESIGNAL_IOS_CATEGORY = Deno.env.get("ONESIGNAL_IOS_CATEGORY") || "NEW_DELIVERY";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sendOneSignal(externalIds: string[], payloadData: any) {
  const fee = Number(payloadData.driver_fee ?? 0).toFixed(2);
  const subtitle =
    `R$ ${fee} • ${payloadData.pickup_address ?? ""} → ${payloadData.delivery_address ?? ""}`;
  const payload: Record<string, unknown> = {
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
      rota: "/entregador",
      request_id: payloadData.request_id,
      driver_fee: payloadData.driver_fee,
      pickup_address: payloadData.pickup_address,
      delivery_address: payloadData.delivery_address,
      url: "/entregador",
    },
    url: "/entregador",
    // Delivery
    priority: 10,
    ttl: 120,
    // ---- Android Notification Channel (Android 8+) ----
    // High importance + lockscreen visibility + custom sound/vibration.
    android_channel_id: ONESIGNAL_ANDROID_CHANNEL_ID,
    android_visibility: 1,             // 1 = PUBLIC (show on lock screen)
    android_accent_color: "FF2563EB",  // ARGB without "#"
    android_led_color: "FF2563EB",
    android_sound: "default",
    // Vibration pattern (ms): wait 0, vibrate 400, pause 200, vibrate 400
    android_vibration_pattern: [0, 400, 200, 400],
    // ---- iOS Category / sound / lockscreen ----
    ios_category: ONESIGNAL_IOS_CATEGORY,
    ios_sound: "default",
    // OneSignal accepts Apple's value with underscore, not hyphen.
    // Invalid values make the entire API call fail with HTTP 400.
    ios_interruption_level: "time_sensitive", // shows on lock screen even in Focus
    mutable_content: true,
    content_available: true,
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

      // Mobile WebViews pause timers/network when the app goes to background.
      // Keep recently online drivers eligible for push for a full work shift.
      const cutoff = Date.now() - 12 * 60 * 60 * 1000;
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

    // ---- Idempotent reservation per (request_id, driver_user_id) ----
    // INSERT ... ON CONFLICT DO NOTHING RETURNING — only the rows actually
    // inserted come back, so concurrent invocations for the same request
    // can never double-send to the same driver.
    const reservation = externalIds.map((uid) => ({
      request_id,
      driver_user_id: uid,
      status: "reserved",
      attempts: 0,
      response: null,
      error: null,
    }));
    const { data: reserved, error: resErr } = await supabase
      .from("push_notification_logs")
      .upsert(reservation, {
        onConflict: "request_id,driver_user_id",
        ignoreDuplicates: true,
      })
      .select("driver_user_id");
    if (resErr) {
      console.error("[PushNotifications] reservation error", resErr);
      return new Response(JSON.stringify({ error: resErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targets = (reserved ?? []).map((r: any) => r.driver_user_id);
    if (targets.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, reason: "already_notified", candidates: externalIds.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await sendWithRetry(targets, {
      request_id,
      driver_fee,
      pickup_address,
      delivery_address,
    });

    // Update the reserved rows with the final send result
    const { error: logErr } = await supabase
      .from("push_notification_logs")
      .update({
        status: result.ok ? "sent" : "failed",
        attempts: result.attempts,
        response: result.json ?? null,
        error: result.ok ? null : (result.error ?? `http_${result.status}`),
      })
      .eq("request_id", request_id)
      .in("driver_user_id", targets);
    if (logErr) console.error("[PushNotifications] log update error", logErr);

    if (!result.ok) {
      console.error("[PushNotifications] all attempts failed", result.status, result.json);
      const errors = Array.isArray(result.json?.errors)
        ? result.json.errors.join("; ")
        : (typeof result.json?.errors === "string" ? result.json.errors : undefined);
      return new Response(
        JSON.stringify({
          error: errors ?? result.error ?? "onesignal_send_failed",
          details: result.json,
          status: result.status,
          attempts: result.attempts,
        }),
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
