// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  configErrorResponse,
  getOneSignalConfig,
  isUuid,
  ONESIGNAL_API_ENDPOINT,
  oneSignalHeaders,
  readOneSignalResponse,
  safeOneSignalLogConfig,
  summarizeOneSignalUser,
  type OneSignalConfig,
} from "../_shared/onesignal.ts";

// Optional: OneSignal Android Notification Category UUID (created in dashboard or via REST).
// If unset, OneSignal uses the default high-importance channel "Miscellaneous".
const ONESIGNAL_ANDROID_CHANNEL_ID = Deno.env.get("ONESIGNAL_ANDROID_CHANNEL_ID") || undefined;
// Optional: iOS APNs Notification Category for action buttons/critical sound config.
const ONESIGNAL_IOS_CATEGORY = Deno.env.get("ONESIGNAL_IOS_CATEGORY") || "NEW_DELIVERY";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, serviceRoleKey);

type SendMode =
  | { mode: "subscriptions"; subscriptionIds: string[]; externalId?: string }
  | { mode: "aliases"; externalIds: string[] }
  | { mode: "segment" };

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

function errorResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validateRequestBody(body: any) {
  const requestId = String(body?.request_id ?? "").trim();
  const driverId = body?.driver_id ? String(body.driver_id).trim() : "";
  const driverFee = Number(body?.driver_fee ?? 0);
  const pickupAddress = String(body?.pickup_address ?? "").trim();
  const deliveryAddress = String(body?.delivery_address ?? "").trim();

  if (!isUuid(requestId)) {
    return { ok: false as const, message: "request_id ausente ou inválido. Envie um UUID válido da entrega." };
  }
  if (driverId && !isUuid(driverId)) {
    return { ok: false as const, message: "driver_id inválido. Envie o UUID do motorista ou deixe vazio para broadcast." };
  }
  if (!Number.isFinite(driverFee) || driverFee < 0) {
    return { ok: false as const, message: "driver_fee inválido." };
  }
  if (!pickupAddress || !deliveryAddress) {
    return { ok: false as const, message: "pickup_address e delivery_address são obrigatórios." };
  }

  return {
    ok: true as const,
    data: {
      request_id: requestId,
      driver_id: driverId || null,
      driver_fee: driverFee,
      pickup_address: pickupAddress,
      delivery_address: deliveryAddress,
    },
  };
}

function validSubscriptionIds(values: unknown[]): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(isUuid)));
}

async function getOneSignalSubscriptionIds(config: OneSignalConfig, driverId: string): Promise<{
  ids: string[];
  error?: { status: number; body: any; message: string; endpoint: string };
}> {
  const endpoint = `https://api.onesignal.com/apps/${config.appId}/users/by/external_id/${encodeURIComponent(driverId)}`;
  try {
    const res = await fetch(endpoint, { headers: oneSignalHeaders(config) });
    const body = await readOneSignalResponse(res);
    console.log("[OneSignal:SubscriptionValidation]", {
      driver_id: driverId,
      endpoint,
      status: res.status,
      ok: res.ok,
      body: summarizeOneSignalUser(body),
    });

    if (!res.ok) {
      return {
        ids: [],
        error: {
          status: res.status,
          body,
          endpoint,
          message: describeError(res.status, body),
        },
      };
    }

    const subscriptions = Array.isArray(body?.subscriptions) ? body.subscriptions : [];
    const active = subscriptions
      .filter((subscription: any) => subscription?.enabled && Number(subscription?.notification_types ?? 0) > 0)
      .map((subscription: any) => subscription?.id);
    return { ids: validSubscriptionIds(active) };
  } catch (error: any) {
    console.error("[OneSignal:SubscriptionValidationError]", { driver_id: driverId, endpoint, error: error?.message ?? String(error) });
    return {
      ids: [],
      error: {
        status: 0,
        body: null,
        endpoint,
        message: "Erro de rede ao validar Subscription ID no OneSignal.",
      },
    };
  }
}

async function getDriverSubscriptionIds(config: OneSignalConfig, driverId: string): Promise<{
  ids: string[];
  source: "onesignal" | "database" | "none";
  error?: { status: number; body: any; message: string; endpoint: string };
}> {
  const remote = await getOneSignalSubscriptionIds(config, driverId);
  if (remote.ids.length > 0 || remote.error) {
    return { ids: remote.ids, source: remote.ids.length > 0 ? "onesignal" : "none", error: remote.error };
  }

  const { data, error } = await (supabase as any)
    .from("onesignal_devices")
    .select("subscription_id,status")
    .eq("user_id", driverId)
    .eq("status", "active")
    .not("subscription_id", "is", null)
    .order("last_synced_at", { ascending: false });

  if (error) {
    console.error("[OneSignal:SubscriptionLookupError]", { driver_id: driverId, error });
    return { ids: [], source: "none" };
  }
  const ids = validSubscriptionIds((data ?? []).map((row: any) => row.subscription_id));
  return { ids, source: ids.length > 0 ? "database" : "none" };
}

async function sendOneSignal(config: OneSignalConfig, target: SendMode, payloadData: any) {
  const fee = Number(payloadData.driver_fee ?? 0).toFixed(2);
  const subtitle =
    `R$ ${fee} • ${payloadData.pickup_address ?? ""} → ${payloadData.delivery_address ?? ""}`;
  // Deep link straight to the delivery so PWA/native clients open the offer.
  const path = payloadData.request_id
    ? `/entregador?entrega=${payloadData.request_id}`
    : "/entregador";
  const deepLink = `${APP_BASE_URL}${path}`;
  const payload: Record<string, unknown> = prune({
    app_id: config.appId,
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

  if (target.mode === "subscriptions") {
    payload.include_subscription_ids = target.subscriptionIds;
  } else if (target.mode === "aliases") {
    payload.include_aliases = { external_id: target.externalIds };
  } else {
    payload.included_segments = ["Subscribed Users"];
    payload.filters = [{ field: "tag", key: "role", relation: "=", value: "driver" }];
  }

  console.log("[OneSignal:Request]", JSON.stringify({
    target: target.mode === "subscriptions"
      ? { mode: target.mode, externalId: target.externalId, subscriptionCount: target.subscriptionIds.length }
      : target,
    url: deepLink,
    endpoint: ONESIGNAL_API_ENDPOINT,
    auth_scheme: config.authScheme,
  }));

  return await fetch(ONESIGNAL_API_ENDPOINT, {
    method: "POST",
    headers: oneSignalHeaders(config),
    body: JSON.stringify(payload),
  });
}

function extractInvalidAliases(json: any): string[] {
  const inv = json?.errors?.invalid_aliases?.external_id;
  if (!Array.isArray(inv)) return [];
  return Array.from(new Set(inv.map((x: any) => String(x))));
}

function hasApiErrors(json: any): boolean {
  const e = json?.errors;
  if (!e) return false;
  if (Array.isArray(e)) return e.length > 0;
  return Object.keys(e).length > 0;
}

function describeError(status: number, json: any): string {
  const e = json?.errors;
  const list = Array.isArray(e) ? e.map((x: any) => String(x)) : [];
  const first = list[0] ?? "";
  if (status === 401) return "REST API Key inválida, ausente ou com prefixo incorreto. Use a REST API Key do aplicativo OneSignal configurado.";
  if (status === 403) return "Acesso negado pelo OneSignal: REST API Key não pertence a este App ID ou não tem permissão.";
  if (/app_id/i.test(first)) return "App ID inválido";
  if (/subscription/i.test(first)) return "Subscription ID inexistente";
  if (first) return first;
  if (status >= 500) return `Erro no OneSignal (HTTP ${status})`;
  return `Payload inválido (HTTP ${status})`;
}

async function sendWithRetry(config: OneSignalConfig, target: SendMode, payloadData: any) {
  let lastErr: any = null;
  let lastJson: any = null;
  let lastStatus = 0;
  // Send once and retry a single time on transient failures (spec requirement).
  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log("[OneSignal:Validation]", {
        attempt,
        target: target.mode,
        config: safeOneSignalLogConfig(config),
      });
      const res = await sendOneSignal(config, target, payloadData);
      lastStatus = res.status;
      lastJson = await readOneSignalResponse(res);
      console.log("[OneSignal:Response]", {
        attempt,
        endpoint: ONESIGNAL_API_ENDPOINT,
        status: res.status,
        ok: res.ok,
        body: lastJson,
      });
      const recipients = Number(lastJson?.recipients ?? 0);
      const hasId = !!(lastJson?.id || lastJson?.notification_id);
      const accepted = lastJson?.accepted === true;
      const invalidAliases = extractInvalidAliases(lastJson);
      // Success = OneSignal accepted the notification (id/accepted). Invalid
      // aliases are tolerated on broadcasts: the valid ones still receive it.
      const onlyInvalidAliasErrors =
        invalidAliases.length > 0 && Object.keys(lastJson?.errors ?? {}).every((k) => k === "invalid_aliases");
      if (res.ok && (hasId || accepted) && (!hasApiErrors(lastJson) || onlyInvalidAliasErrors)) {
        console.log("[OneSignal:Success]", { attempt, id: lastJson?.id, recipients, invalid: invalidAliases.length });
        return { ok: true, attempts: attempt, json: lastJson, status: res.status, recipients };
      }
      // Non-transient failures: do NOT retry.
      const invalid = invalidAliases;
      const authError = res.status === 401 || res.status === 403;
      const validationError = res.status === 400 && hasApiErrors(lastJson);
      if (invalid.length > 0 || authError || validationError) {
        console.error("[OneSignal:Error] non_transient", {
          invalid,
          endpoint: ONESIGNAL_API_ENDPOINT,
          status: res.status,
          body: lastJson,
          message: describeError(res.status, lastJson),
        });
        return {
          ok: false, attempts: attempt, json: lastJson, status: res.status, recipients,
          error: authError
            ? "onesignal_auth_error"
            : invalid.length > 0
              ? "invalid_aliases"
              : "invalid_payload",
          message: describeError(res.status, lastJson),
        };
      }

      console.warn("[OneSignal:Error] attempt", attempt, "no_recipients", { status: res.status, body: lastJson });
    } catch (e) {
      lastErr = e;
      console.error("[OneSignal:Error] attempt", attempt, "threw", e);
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
    message: lastErr ? "Erro de rede ao contatar o OneSignal" : describeError(lastStatus, lastJson),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const configResult = getOneSignalConfig();
    if (!configResult.ok) {
      const response = configErrorResponse(configResult);
      return new Response(response.body, {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { config } = configResult;

    const body = await req.json().catch(() => ({}));
    const parsed = validateRequestBody(body);
    if (!parsed.ok) {
      console.error("[OneSignal:PayloadError]", { message: parsed.message, body_keys: Object.keys(body ?? {}) });
      return errorResponse(400, { error: "invalid_payload", message: parsed.message });
    }

    const {
      request_id,
      driver_id,
      driver_fee,
      pickup_address,
      delivery_address,
    } = parsed.data;

    console.log("[OneSignal] request received", {
      request_id,
      driver_id,
      has_pickup: !!pickup_address,
      config: safeOneSignalLogConfig(config),
    });

    const payloadData = { request_id, driver_fee, pickup_address, delivery_address };


    // ---------- Targeted delivery: single driver ----------
    if (driver_id) {
      const subscriptionTarget = await getDriverSubscriptionIds(config, driver_id);
      const subscriptionIds = subscriptionTarget.ids;
      if (subscriptionTarget.error) {
        console.error("[OneSignal:ValidationError] subscription validation failed", {
          request_id,
          driver_id,
          error: subscriptionTarget.error,
        });
        return errorResponse(200, {
          sent: 0,
          reason: subscriptionTarget.error.status === 401 || subscriptionTarget.error.status === 403
            ? "onesignal_auth_error"
            : "onesignal_subscription_validation_failed",
          message: subscriptionTarget.error.message,
          status: subscriptionTarget.error.status,
          details: subscriptionTarget.error.body,
          endpoint: subscriptionTarget.error.endpoint,
        });
      }
      if (subscriptionIds.length === 0) {
        console.error("[OneSignal:ValidationError] no valid subscription_id", { request_id, driver_id, source: subscriptionTarget.source });
        return errorResponse(200, {
          sent: 0,
          reason: "driver_not_subscribed",
          message: "Este motorista não possui Subscription ID ativo/válido no OneSignal. Peça para ele abrir o app, conceder permissão de notificação e tentar novamente.",
          status: 0,
        });
      }

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

      const result = await sendWithRetry(
        config,
        { mode: "subscriptions", subscriptionIds, externalId: driver_id },
        payloadData,
      );
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
          : ((result as any).message ?? `OneSignal respondeu com falha (HTTP ${result.status}).`);
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
        request_id, driver_id, recipients: result.recipients, attempts: result.attempts, subscription_source: subscriptionTarget.source,
      });
      return new Response(
        JSON.stringify({
          sent: 1,
          accepted: true,
          notification_id: (result.json as any)?.id ?? null,
          recipients: result.recipients,
          warning: result.recipients === 0
            ? "aceito_sem_destinatarios"
            : undefined,
          message: result.recipients === 0
            ? "OneSignal aceitou a notificação, mas informou 0 destinatários. O dispositivo do motorista provavelmente revogou a permissão de notificação ou a inscrição está desativada — peça para abrir o app e reativar as notificações."
            : undefined,
          attempts: result.attempts,
          subscription_source: subscriptionTarget.source,
          subscription_count: subscriptionIds.length,
          onesignal: result.json,
        }),
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

    const result = await sendWithRetry(config, { mode: "segment" }, payloadData);
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
        : ((result as any).message ?? `OneSignal respondeu com falha (HTTP ${result.status}).`);
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
      // `recipients` can be omitted by the v16 API; `accepted` marks real success.
      JSON.stringify({
        sent: result.recipients,
        accepted: true,
        notification_id: (result.json as any)?.id ?? null,
        attempts: result.attempts,
        onesignal: result.json,
      }),
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
