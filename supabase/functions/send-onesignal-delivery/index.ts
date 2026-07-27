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

type SendMode = { mode: "aliases"; externalIds: string[] } | { mode: "segment" };

// ROOT CAUSE (HTTP 400): we were sending BOTH `url` and `web_url`, and the value
// was a relative path. OneSignal answers:
//   "Url Remove url field when setting app_url or web_url"
//   "Option Begin your notification web_url with http:// or https://."
// Fix: send ONLY `url`, always as an absolute https URL.
const APP_BASE_URL = (Deno.env.get("PUBLIC_APP_URL") || "https://duarteentregas.lovable.app")
  .replace(/\/+$/, "");

function prune(obj: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  );
}

async function sendOneSignal(target: SendMode, payloadData: any) {
  const fee = Number(payloadData.driver_fee ?? 0).toFixed(2);
  const subtitle =
    `R$ ${fee} • ${payloadData.pickup_address ?? ""} → ${payloadData.delivery_address ?? ""}`;
  // Deep link straight to the delivery so PWA/native clients open the offer.
  const path = payloadData.request_id
    ? `/entregador?entrega=${payloadData.request_id}`
    : "/entregador";
  const deepLink = `${APP_BASE_URL}${path}`;
  const payload: Record<string, unknown> = prune({
    app_id: ONESIGNAL_APP_ID,
    target_channel: "push",
    headings: { en: "🚚 Nova entrega disponível", pt: "🚚 Nova entrega disponível" },
    contents: {
      en: `Você recebeu uma nova entrega. Toque para visualizar. ${subtitle}`,
      pt: `Você recebeu uma nova entrega. Toque para visualizar. ${subtitle}`,
    },
    data: prune({
      pedido_id: payloadData.request_id,
      tipo: "nova_entrega",
      rota: path,
      request_id: payloadData.request_id,
      driver_fee: payloadData.driver_fee,
      pickup_address: payloadData.pickup_address,
      delivery_address: payloadData.delivery_address,
      url: deepLink,
    }),
    // Only `url` — never together with `web_url`/`app_url`.
    url: deepLink,
    chrome_web_icon: `${APP_BASE_URL}/icon-192.png`,
    chrome_web_badge: `${APP_BASE_URL}/icon-192.png`,
    priority: 10,
    ttl: 30,
    android_channel_id: ONESIGNAL_ANDROID_CHANNEL_ID,
    android_visibility: 1,
    android_accent_color: "FF2563EB",
    android_led_color: "FF2563EB",
    android_sound: "default",
    android_vibration_pattern: [0, 1000, 500, 1000, 500, 1000],
    ios_category: ONESIGNAL_IOS_CATEGORY,
    ios_sound: "default",
    ios_interruption_level: "time_sensitive",
    mutable_content: true,
    content_available: true,
  });

  if (target.mode === "aliases") {
    payload.include_aliases = { external_id: target.externalIds };
  } else {
    payload.included_segments = ["Subscribed Users"];
    payload.filters = [{ field: "tag", key: "role", relation: "=", value: "driver" }];
  }

  console.log("[OneSignal:Request]", JSON.stringify({ target, url: deepLink }));

  return await fetch("https://api.onesignal.com/notifications?c=push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
}

function extractInvalidAliases(json: any): string[] {
  const inv = json?.errors?.invalid_aliases?.external_id;
  if (!Array.isArray(inv)) return [];
  return Array.from(new Set(inv.map((x: any) => String(x))));
}

async function sendWithRetry(target: SendMode, payloadData: any) {
  let lastErr: any = null;
  let lastJson: any = null;
  let lastStatus = 0;
  // Send once and retry a single time on transient failures (spec requirement).
  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log("[OneSignal] attempt", attempt, "target", target.mode);
      const res = await sendOneSignal(target, payloadData);
      lastStatus = res.status;
      lastJson = await res.json().catch(() => ({}));
      console.log("[OneSignal] response", { attempt, status: res.status, body: lastJson });
      const recipients = Number(lastJson?.recipients ?? 0);
      const hasId = !!lastJson?.id;
      if (res.ok && hasId && recipients > 0) {
        return { ok: true, attempts: attempt, json: lastJson, status: res.status, recipients };
      }
      // Non-transient failures: do NOT retry.
      const invalid = extractInvalidAliases(lastJson);
      const authError = res.status === 401 || res.status === 403;
      if (invalid.length > 0 || authError) {
        console.warn("[OneSignal] non_transient_failure", { invalid, status: res.status });
        return {
          ok: false, attempts: attempt, json: lastJson, status: res.status,
          recipients, error: authError ? "onesignal_auth_error" : "invalid_aliases",
        };
      }
      console.warn("[OneSignal] attempt", attempt, "no_recipients", { status: res.status, body: lastJson });
    } catch (e) {
      lastErr = e;
      console.error("[OneSignal] attempt", attempt, "threw", e);
    }
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 400));
  }
  return {
    ok: false,
    attempts: MAX_ATTEMPTS,
    json: lastJson,
    status: lastStatus,
    recipients: Number(lastJson?.recipients ?? 0),
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

    console.log("[OneSignal] request received", { request_id, driver_id, has_pickup: !!pickup_address });

    if (!ONESIGNAL_REST_API_KEY) {
      console.error("[OneSignal] missing ONESIGNAL_REST_API_KEY secret");
      return new Response(
        JSON.stringify({ error: "config_error", message: "ONESIGNAL_REST_API_KEY não configurada no backend." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!request_id) {
      return new Response(JSON.stringify({ error: "missing request_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payloadData = { request_id, driver_fee, pickup_address, delivery_address };


    // ---------- Targeted delivery: single driver ----------
    if (driver_id) {
      // Idempotent reservation for the specific driver via unique-violation catch
      const { error: resErr } = await supabase
        .from("push_notification_logs")
        .insert([{ request_id, driver_user_id: driver_id, status: "reserved", attempts: 0, response: null, error: null }]);
      if (resErr) {
        if ((resErr as any).code === "23505") {
          return new Response(
            JSON.stringify({ sent: 0, reason: "already_notified" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        console.error("[PushNotifications] reservation error", resErr);
        return new Response(JSON.stringify({ error: resErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await sendWithRetry({ mode: "aliases", externalIds: [driver_id] }, payloadData);
      const invalid = extractInvalidAliases(result.json);
      await supabase
        .from("push_notification_logs")
        .update({
          status: result.ok ? "sent" : "failed",
          attempts: result.attempts,
          response: result.json ?? null,
          error: result.ok
            ? null
            : (invalid.length > 0
                ? `invalid_alias:${invalid.join(",")}`
                : (result.error ?? `http_${result.status}`)),
        })
        .eq("request_id", request_id)
        .eq("driver_user_id", driver_id);

      if (!result.ok) {
        const isInvalidAlias = invalid.length > 0;
        const reason = isInvalidAlias
          ? "driver_not_subscribed"
          : (result.error ?? "onesignal_send_failed");
        const message = isInvalidAlias
          ? "Este motorista ainda não registrou o dispositivo no OneSignal. Peça para ele abrir o app, conceder permissão de notificação e tentar novamente."
          : `OneSignal respondeu com falha (HTTP ${result.status}).`;
        // Return 200 so the client sees the real reason instead of "non-2xx".
        return new Response(
          JSON.stringify({
            sent: 0,
            reason,
            message,
            invalid_aliases: invalid,
            details: result.json,
            status: result.status,
            attempts: result.attempts,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      console.log("[PushNotifications] sent (targeted)", {
        request_id, driver_id, recipients: result.recipients, attempts: result.attempts,
      });
      return new Response(
        JSON.stringify({ sent: 1, recipients: result.recipients, attempts: result.attempts, onesignal: result.json }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---------- Broadcast: all drivers via segment + tag filter ----------
    // Reserve one broadcast slot per request so we never send twice for the
    // same delivery even if the trigger fires multiple times.
    const BROADCAST_UUID = "00000000-0000-0000-0000-000000000000";
    const { error: resErr } = await supabase
      .from("push_notification_logs")
      .insert([{ request_id, driver_user_id: BROADCAST_UUID, status: "reserved", attempts: 0, response: null, error: null }]);
    if (resErr) {
      if ((resErr as any).code === "23505") {
        return new Response(
          JSON.stringify({ sent: 0, reason: "already_broadcast" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      console.error("[PushNotifications] broadcast reservation error", resErr);
      return new Response(JSON.stringify({ error: resErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await sendWithRetry({ mode: "segment" }, payloadData);
    await supabase
      .from("push_notification_logs")
      .update({
        status: result.ok ? "sent" : "failed",
        attempts: result.attempts,
        response: result.json ?? null,
        error: result.ok ? null : (result.error ?? `http_${result.status}_recipients_${result.recipients}`),
      })
      .eq("request_id", request_id)
      .eq("driver_user_id", BROADCAST_UUID);

    if (!result.ok) {
      console.error("[OneSignal] broadcast failed", result.status, result.json);
      const noRecipients = result.recipients === 0;
      const reason = noRecipients ? "no_subscribed_drivers" : (result.error ?? "onesignal_send_failed");
      const message = noRecipients
        ? "Nenhum motorista com dispositivo registrado no OneSignal. Peça para os motoristas abrirem o app e concederem permissão de notificação."
        : `OneSignal respondeu com falha (HTTP ${result.status}).`;
      return new Response(
        JSON.stringify({
          sent: 0,
          reason,
          message,
          details: result.json,
          status: result.status,
          recipients: result.recipients,
          attempts: result.attempts,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[PushNotifications] broadcast sent", {
      request_id, recipients: result.recipients, attempts: result.attempts,
    });
    return new Response(
      JSON.stringify({ sent: result.recipients, attempts: result.attempts, onesignal: result.json }),
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
