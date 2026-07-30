/**
 * notify-available-drivers — sends the "new delivery" push to every eligible
 * driver device, exactly once per delivery request.
 *
 * Called by the backend AFTER the delivery request is committed. A push
 * failure must never undo or block the delivery itself, so the caller treats
 * any non-OK result as informational.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  ANDROID_CHANNEL_ID,
  chunk,
  getOneSignalConfig,
  sendOneSignal,
} from "../_shared/onesignal.ts";
import { adminClient, jsonResponse, logDelivery, requireUser } from "../_shared/push-auth.ts";

/** Drivers whose app was seen within this window still get a push. */
const RECENT_SEEN_HOURS = 12;

interface Body {
  pedido_id?: string;
  /** Optional: several stops created at once (grouped route). */
  group_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await requireUser(req);
  if (!caller) return jsonResponse({ error: "Não autenticado" }, 401, corsHeaders);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Corpo inválido" }, 400, corsHeaders);
  }

  const pedidoId = (body.pedido_id ?? "").trim();
  if (!pedidoId) {
    return jsonResponse({ error: "pedido_id é obrigatório" }, 400, corsHeaders);
  }

  const admin = adminClient();
  const eventKey = `nova_entrega:${pedidoId}`;

  // ---- 1. Load and validate the delivery request -------------------------
  const { data: pedido, error: pedidoError } = await admin
    .from("delivery_requests")
    .select("id, status, driver_id, store_owner_id, pickup_address, delivery_address, driver_fee, group_id")
    .eq("id", pedidoId)
    .maybeSingle();

  if (pedidoError || !pedido) {
    return jsonResponse(
      { ok: false, code: "PEDIDO_NAO_ENCONTRADO", message: "Pedido não encontrado." },
      200,
      corsHeaders,
    );
  }

  // Only the store owner that created it, or an admin, may trigger the blast.
  if (!caller.isAdmin && pedido.store_owner_id !== caller.userId) {
    return jsonResponse({ error: "Sem permissão" }, 403, corsHeaders);
  }

  if (pedido.status !== "pending") {
    return jsonResponse(
      { ok: false, code: "PEDIDO_INDISPONIVEL", message: `Pedido está em "${pedido.status}".` },
      200,
      corsHeaders,
    );
  }

  // ---- 2. Idempotency lock ----------------------------------------------
  const { data: job, error: jobError } = await admin
    .from("notification_jobs")
    .insert({
      event_key: eventKey,
      pedido_id: pedidoId,
      event_type: "nova_entrega",
      status: "processing",
      attempts: 1,
    })
    .select("id")
    .maybeSingle();

  if (jobError) {
    // Unique violation => another invocation already handled this delivery.
    const { data: existing } = await admin
      .from("notification_jobs")
      .select("status, recipients_count, onesignal_notification_id")
      .eq("event_key", eventKey)
      .maybeSingle();
    return jsonResponse(
      {
        ok: existing?.status === "sent",
        code: "JA_ENVIADO",
        message: "Este pedido já gerou um envio.",
        status: existing?.status ?? "unknown",
        recipients: existing?.recipients_count ?? 0,
      },
      200,
      corsHeaders,
    );
  }

  const finish = async (
    status: string,
    patch: Record<string, unknown>,
    responseBody: Record<string, unknown>,
    log: Record<string, unknown>,
  ) => {
    await admin
      .from("notification_jobs")
      .update({ status, processed_at: new Date().toISOString(), ...patch })
      .eq("id", job!.id);
    await logDelivery(admin, { pedido_id: pedidoId, event_type: "nova_entrega", ...log });
    return jsonResponse(responseBody, 200, corsHeaders);
  };

  // ---- 3. Credentials ----------------------------------------------------
  const { configured, missing } = getOneSignalConfig();
  if (!configured) {
    return await finish(
      "failed",
      { last_error: `Secrets ausentes: ${missing.join(", ")}` },
      {
        ok: false,
        code: "MISSING_CREDENTIALS",
        message: `Configure os secrets: ${missing.join(", ")}.`,
        recipients: 0,
      },
      { error_code: "MISSING_CREDENTIALS", recipients_count: 0 },
    );
  }

  // ---- 4. Eligible drivers ----------------------------------------------
  // A directed request only alerts the chosen driver.
  let driverUserIds: string[] | null = null;

  if (pedido.driver_id) {
    driverUserIds = [pedido.driver_id];
  } else {
    const cutoff = new Date(Date.now() - RECENT_SEEN_HOURS * 3600_000).toISOString();
    const { data: drivers } = await admin
      .from("drivers")
      .select("user_id, is_active, is_online, last_seen_at, approval_status")
      .eq("is_active", true)
      .eq("approval_status", "approved");

    driverUserIds = (drivers ?? [])
      // Online now, or the app was alive recently — push exists precisely to
      // reach drivers whose app is closed, so a hard is_online filter would
      // silence the very devices we need to wake up.
      .filter((d: any) => d.is_online === true || (d.last_seen_at && d.last_seen_at >= cutoff))
      .map((d: any) => d.user_id);
  }

  // Suspended accounts never get offers.
  if (driverUserIds.length > 0) {
    const { data: suspended } = await admin
      .from("profiles")
      .select("user_id, suspended_until")
      .in("user_id", driverUserIds)
      .not("suspended_until", "is", null);
    const blocked = new Set(
      (suspended ?? [])
        .filter((p: any) => new Date(p.suspended_until).getTime() > Date.now())
        .map((p: any) => p.user_id),
    );
    driverUserIds = driverUserIds.filter((id) => !blocked.has(id));
  }

  if (driverUserIds.length === 0) {
    return await finish(
      "no_recipients",
      { recipients_count: 0, last_error: "Nenhum motorista elegível" },
      {
        ok: false,
        code: "NO_ELIGIBLE_DRIVERS",
        message: "Nenhum motorista disponível no momento.",
        recipients: 0,
        eligible_drivers: 0,
      },
      { error_code: "NO_ELIGIBLE_DRIVERS", recipients_count: 0 },
    );
  }

  // ---- 5. Active subscriptions (deduplicated) ----------------------------
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("onesignal_subscription_id, platform, user_id")
    .in("user_id", driverUserIds)
    .eq("profile_type", "driver")
    .eq("active", true)
    .eq("subscription_status", "subscribed")
    .eq("permission_status", "granted");

  // Split by platform: Web/PWA payloads must never carry Android-only fields.
  const activeSubs = (subs ?? []).filter((s: any) => s.onesignal_subscription_id);
  const seen = new Set<string>();
  const webIds: string[] = [];
  const androidIds: string[] = [];
  for (const s of activeSubs as any[]) {
    const id = s.onesignal_subscription_id as string;
    if (seen.has(id)) continue;
    seen.add(id);
    if (s.platform === "android_apk") androidIds.push(id);
    else webIds.push(id);
  }
  const subscriptionIds = [...webIds, ...androidIds];

  if (subscriptionIds.length === 0) {
    return await finish(
      "no_recipients",
      { recipients_count: 0, last_error: "Nenhuma inscrição ativa" },
      {
        ok: false,
        code: "NO_SUBSCRIPTIONS",
        message:
          "Motoristas disponíveis, mas nenhum aparelho com notificações ativas. Eles continuam vendo a entrega no painel.",
        recipients: 0,
        eligible_drivers: driverUserIds.length,
      },
      { error_code: "NO_SUBSCRIPTIONS", recipients_count: 0 },
    );
  }

  // ---- 6. Payload --------------------------------------------------------
  const rota = `/entregador?entrega=${pedido.id}`;
  const valor = pedido.driver_fee ? ` (R$ ${Number(pedido.driver_fee).toFixed(2)})` : "";

  const basePayload: Record<string, unknown> = {
    headings: {
      pt: "🚚 Nova entrega disponível",
      en: "New delivery available",
    },
    contents: {
      pt: `Um lojista solicitou um motorista${valor}. Toque para visualizar.`,
      en: "A merchant requested a driver. Tap to view.",
    },
    data: {
      tipo: "nova_entrega",
      pedido_id: pedido.id,
      rota,
      evento_id: eventKey,
    },
    priority: 10,
    // Actions
    buttons: [{ id: "ver_entrega", text: "Ver entrega" }],
    web_buttons: [
      {
        id: "ver_entrega",
        text: "Ver entrega",
        url: rota,
      },
    ],
    // The offer is only meaningful while it is unassigned.
    ttl: 900,
    collapse_id: eventKey,
  };

  const webPayload = buildPlatformPayload(basePayload, "web");
  const androidPayload = buildPlatformPayload(basePayload, "android_native");

  // ---- 7. Send (batched, per platform) -----------------------------------
  let totalRecipients = 0;
  let firstNotificationId: string | null = null;
  let lastError: string | undefined;
  let lastErrorCode: string | undefined;
  let lastStatus = 0;
  let lastSanitized: Record<string, unknown> = {};

  const batches: Array<{ platform: "web" | "android_native"; ids: string[] }> = [
    ...chunk(webIds).map((ids) => ({ platform: "web" as const, ids })),
    ...chunk(androidIds).map((ids) => ({ platform: "android_native" as const, ids })),
  ];

  for (const batch of batches) {
    if (batch.ids.length === 0) continue;
    const result = await sendOneSignal({
      ...(batch.platform === "web" ? webPayload : androidPayload),
      include_subscription_ids: batch.ids,
    });
    totalRecipients += result.recipients;
    if (!firstNotificationId) firstNotificationId = result.notificationId;
    lastStatus = result.httpStatus;
    lastSanitized = result.sanitized;
    if (result.errorCode) {
      lastErrorCode = result.errorCode;
      lastError = result.errorMessage;
    }
    console.log("[push] lote enviado", {
      pedido_id: pedidoId,
      platform: batch.platform,
      ids: batch.ids.length,
      recipients: result.recipients,
      http: result.httpStatus,
      code: result.errorCode ?? "ok",
    });
  }

  const delivered = totalRecipients > 0;

  return await finish(
    delivered ? "sent" : "failed",
    {
      recipients_count: totalRecipients,
      onesignal_notification_id: firstNotificationId,
      last_error: delivered ? null : lastError ?? "Envio recusado",
    },
    {
      ok: delivered,
      code: delivered ? "SENT" : lastErrorCode ?? "SEND_FAILED",
      message: delivered
        ? `Notificação aceita pelo OneSignal para ${totalRecipients} aparelho(s).`
        : lastError ?? "O OneSignal não aceitou o envio.",
      recipients: totalRecipients,
      eligible_drivers: driverUserIds.length,
      subscriptions: subscriptionIds.length,
      notification_id: firstNotificationId,
      http_status: lastStatus,
      response: lastSanitized,
    },
    {
      recipients_count: totalRecipients,
      onesignal_notification_id: firstNotificationId,
      response_status: lastStatus,
      response_body_sanitized: lastSanitized,
      error_code: delivered ? null : lastErrorCode ?? "SEND_FAILED",
    },
  );
});
