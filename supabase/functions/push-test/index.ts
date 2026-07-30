/**
 * push-test — admin-only test sender.
 *
 * Reports the REAL outcome: a 200 from this function only means the request
 * was accepted by OneSignal, never that the phone displayed anything.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { buildPlatformPayload, chunk, getOneSignalConfig, sendOneSignal } from "../_shared/onesignal.ts";
import { adminClient, jsonResponse, logDelivery, requireUser } from "../_shared/push-auth.ts";

interface Body {
  /** "subscription" | "driver" | "all_drivers" */
  target: string;
  user_id?: string;
  subscription_id?: string;
  /** Optional filter when target = "driver" or "all_drivers". */
  platform?: "android_apk" | "web_pwa" | "ios";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await requireUser(req);
  if (!caller) return jsonResponse({ error: "Não autenticado" }, 401, corsHeaders);
  if (!caller.isAdmin) return jsonResponse({ error: "Apenas administradores" }, 403, corsHeaders);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Corpo inválido" }, 400, corsHeaders);
  }

  const { configured, missing } = getOneSignalConfig();
  if (!configured) {
    return jsonResponse(
      {
        ok: false,
        code: "MISSING_CREDENTIALS",
        message: `Configure os secrets: ${missing.join(", ")}.`,
        recipients: 0,
      },
      200,
      corsHeaders,
    );
  }

  const admin = adminClient();

  // ---- Resolve target devices -------------------------------------------
  let query = admin
    .from("push_subscriptions")
    .select(
      "onesignal_subscription_id, user_id, platform, permission_status, subscription_status, active, last_seen_at",
    )
    .eq("active", true);

  if (body.target === "subscription") {
    if (!body.subscription_id) {
      return jsonResponse({ error: "subscription_id é obrigatório" }, 400, corsHeaders);
    }
    query = query.eq("onesignal_subscription_id", body.subscription_id);
  } else if (body.target === "driver") {
    if (!body.user_id) {
      return jsonResponse({ error: "user_id é obrigatório" }, 400, corsHeaders);
    }
    query = query.eq("user_id", body.user_id);
  } else {
    query = query.eq("profile_type", "driver");
  }

  if (body.platform) query = query.eq("platform", body.platform);

  const { data: subs, error } = await query;
  if (error) return jsonResponse({ error: error.message }, 500, corsHeaders);

  const devices = (subs ?? []).filter(
    (s: any) => s.subscription_status === "subscribed" && s.permission_status === "granted",
  );
  const ids = Array.from(new Set(devices.map((s: any) => s.onesignal_subscription_id)));
  const androidIds = Array.from(
    new Set(
      devices
        .filter((s: any) => s.platform === "android_apk")
        .map((s: any) => s.onesignal_subscription_id),
    ),
  );
  const webIds = ids.filter((id) => !androidIds.includes(id));

  const inspected = (subs ?? []).map((s: any) => ({
    user_id: s.user_id,
    platform: s.platform,
    permission_status: s.permission_status,
    subscription_status: s.subscription_status,
    active: s.active,
    subscription_tail: String(s.onesignal_subscription_id).slice(-8),
    last_seen_at: s.last_seen_at,
  }));

  if (ids.length === 0) {
    await logDelivery(admin, {
      event_type: "teste_push",
      platform: body.platform ?? null,
      recipients_count: 0,
      error_code: "NO_SUBSCRIPTIONS",
    });
    return jsonResponse(
      {
        ok: false,
        code: "NO_SUBSCRIPTIONS",
        message:
          "Nenhum aparelho elegível. Verifique permissão concedida e inscrição ativa na lista abaixo.",
        recipients: 0,
        devices: inspected,
        sent_at: new Date().toISOString(),
      },
      200,
      corsHeaders,
    );
  }

  // ---- Send --------------------------------------------------------------
  let recipients = 0;
  let notificationId: string | null = null;
  let httpStatus = 0;
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  let sanitized: Record<string, unknown> = {};

  const base: Record<string, unknown> = {
    headings: { pt: "🔔 Teste de notificação", en: "Push test" },
    contents: {
      pt: "O sistema de notificações está funcionando neste aparelho.",
      en: "Push notifications are working on this device.",
    },
    data: { tipo: "teste_push", rota: "/entregador" },
    priority: 10,
    ttl: 300,
  };
  const webPayload = buildPlatformPayload(base, "web");
  const androidPayload = buildPlatformPayload(base, "android_native");

  const batches: Array<{ platform: "web" | "android_native"; ids: string[] }> = [
    ...chunk(webIds).map((b) => ({ platform: "web" as const, ids: b })),
    ...chunk(androidIds).map((b) => ({ platform: "android_native" as const, ids: b })),
  ];

  for (const batch of batches) {
    if (batch.ids.length === 0) continue;
    const result = await sendOneSignal({
      ...(batch.platform === "web" ? webPayload : androidPayload),
      include_subscription_ids: batch.ids,
    });
    recipients += result.recipients;
    if (!notificationId) notificationId = result.notificationId;
    httpStatus = result.httpStatus;
    sanitized = result.sanitized;
    if (result.errorCode) {
      errorCode = result.errorCode;
      errorMessage = result.errorMessage;
    }
  }

  await logDelivery(admin, {
    event_type: "teste_push",
    platform: body.platform ?? null,
    recipients_count: recipients,
    onesignal_notification_id: notificationId,
    response_status: httpStatus,
    response_body_sanitized: sanitized,
    error_code: recipients > 0 ? null : errorCode ?? "SEND_FAILED",
  });

  return jsonResponse(
    {
      ok: recipients > 0,
      code: recipients > 0 ? (errorCode === "PARTIAL" ? "PARTIAL" : "ACCEPTED") : errorCode ?? "SEND_FAILED",
      message:
        recipients > 0
          ? `OneSignal aceitou o envio para ${recipients} aparelho(s). A exibição depende das configurações de cada aparelho.`
          : errorMessage ?? "O OneSignal não aceitou o envio.",
      targeted_devices: ids.length,
      recipients,
      notification_id: notificationId,
      http_status: httpStatus,
      response: sanitized,
      devices: inspected,
      sent_at: new Date().toISOString(),
    },
    200,
    corsHeaders,
  );
});
