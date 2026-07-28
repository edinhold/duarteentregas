// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  configErrorResponse,
  getOneSignalConfig,
  isUuid,
  oneSignalHeaders,
  readOneSignalResponse,
} from "../_shared/onesignal.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function logEvent(row: Record<string, unknown>) {
  const { error } = await (supabase as any).from("push_delivery_events").insert([row]);
  if (error) console.error("[CancelPush] log error", error);
}

/** Silent data-only push so every other device removes the offer locally. */
async function sendSilentSync(config: any, pedidoId: string, subscriptionIds: string[]) {
  if (subscriptionIds.length === 0) return { recipients: 0, id: null, status: 0, body: null };
  const payload = {
    app_id: config.appId,
    target_channel: "push",
    include_subscription_ids: subscriptionIds.slice(0, 2000),
    content_available: true,
    priority: 10,
    ttl: 60,
    data: {
      tipo: "entrega_indisponivel",
      pedido_id: pedidoId,
      acao: "remover",
      rota: "/entregador",
      evento_id: `entrega_indisponivel:${pedidoId}`,
    },
  };
  const res = await fetch("https://api.onesignal.com/notifications?c=push", {
    method: "POST",
    headers: oneSignalHeaders(config),
    body: JSON.stringify(payload),
  });
  const body = await readOneSignalResponse(res);
  return {
    recipients: Number(body?.recipients ?? 0),
    id: body?.id ?? null,
    status: res.status,
    body,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const configResult = getOneSignalConfig();
    if (!configResult.ok) {
      const r = configErrorResponse(configResult);
      return new Response(r.body, { status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { config } = configResult;

    const body = await req.json().catch(() => ({}));
    const pedidoId = String(body?.pedido_id ?? body?.request_id ?? "").trim();
    const acceptedBy = String(body?.accepted_by ?? "").trim();
    if (!isUuid(pedidoId)) return json(400, { error: "invalid_payload", message: "pedido_id inválido." });

    // Always read the authoritative row (the trigger may pass a stale id).
    const { data: pedido } = await (supabase as any)
      .from("delivery_requests")
      .select("id, driver_id, status, onesignal_notification_id")
      .eq("id", pedidoId)
      .maybeSingle();

    const notificationId = String(body?.notification_id ?? pedido?.onesignal_notification_id ?? "").trim();
    const winner = acceptedBy || String(pedido?.driver_id ?? "");

    await logEvent({
      pedido_id: pedidoId,
      event_type: "entrega_aceita",
      accepted_by: isUuid(winner) ? winner : null,
      status: "ok",
    });

    // 1) Remote cancellation of the original visible notification.
    let cancelStatus = 0;
    let cancelBody: any = null;
    if (notificationId) {
      const endpoint = `https://api.onesignal.com/notifications/${encodeURIComponent(notificationId)}?app_id=${config.appId}`;
      try {
        const res = await fetch(endpoint, { method: "DELETE", headers: oneSignalHeaders(config) });
        cancelStatus = res.status;
        cancelBody = await readOneSignalResponse(res);
        console.log("[CancelPush] delete", { pedidoId, notificationId, status: res.status, body: cancelBody });
        await logEvent({
          pedido_id: pedidoId,
          event_type: res.ok ? "notificacao_cancelada" : "notificacao_cancelamento_erro",
          onesignal_notification_id: notificationId,
          status: res.ok ? "ok" : "error",
          response_status: res.status,
          response_body_sanitized: cancelBody ?? null,
        });
      } catch (e: any) {
        console.error("[CancelPush] delete failed", e);
        await logEvent({
          pedido_id: pedidoId,
          event_type: "notificacao_cancelamento_erro",
          onesignal_notification_id: notificationId,
          status: "error",
          response_body_sanitized: { error: String(e?.message ?? e) },
        });
      }
    }

    // 2) Silent sync event to every other driver device (dedup by subscription).
    const { data: drivers } = await (supabase as any)
      .from("drivers")
      .select("user_id")
      .eq("approval_status", "approved")
      .eq("is_active", true);
    const driverIds = (drivers ?? [])
      .map((d: any) => String(d.user_id))
      .filter((id: string) => isUuid(id) && id !== winner);

    let subscriptionIds: string[] = [];
    if (driverIds.length > 0) {
      const { data: devices } = await (supabase as any)
        .from("onesignal_devices")
        .select("subscription_id")
        .in("user_id", driverIds)
        .eq("status", "active")
        .not("subscription_id", "is", null);
      subscriptionIds = Array.from(
        new Set((devices ?? []).map((d: any) => String(d.subscription_id ?? "").trim()).filter(isUuid)),
      );
    }

    const silent = await sendSilentSync(config, pedidoId, subscriptionIds);
    if (subscriptionIds.length > 0) {
      await logEvent({
        pedido_id: pedidoId,
        event_type: "notificacao_cancelada",
        onesignal_notification_id: silent.id,
        recipients_count: silent.recipients,
        status: silent.id ? "ok" : "error",
        response_status: silent.status,
        response_body_sanitized: silent.body ?? null,
      });
    }

    return json(200, {
      ok: true,
      pedido_id: pedidoId,
      cancelled_notification_id: notificationId || null,
      cancel_status: cancelStatus,
      silent_sync_recipients: silent.recipients,
      silent_sync_devices: subscriptionIds.length,
    });
  } catch (err: any) {
    console.error("[CancelPush] handler error", err);
    return json(500, { error: err?.message ?? "error" });
  }
});
