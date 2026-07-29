/**
 * cancel-delivery-notification — invalidates a delivery offer everywhere.
 *
 * Runs right after a driver wins the atomic accept. It:
 *  1. best-effort cancels the queued OneSignal notification;
 *  2. sends a SILENT data-only sync push so every other device removes the
 *     card, stops the local alarm and closes the offer modal.
 *
 * Notifications already sitting in the Android tray cannot be pulled back by
 * anyone; the client re-checks the database on tap and shows
 * "Esta entrega não está mais disponível."
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { cancelOneSignal, chunk, getOneSignalConfig, sendOneSignal } from "../_shared/onesignal.ts";
import { adminClient, jsonResponse, logDelivery, requireUser } from "../_shared/push-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await requireUser(req);
  if (!caller) return jsonResponse({ error: "Não autenticado" }, 401, corsHeaders);

  let pedidoId = "";
  try {
    pedidoId = String((await req.json())?.pedido_id ?? "").trim();
  } catch {
    return jsonResponse({ error: "Corpo inválido" }, 400, corsHeaders);
  }
  if (!pedidoId) return jsonResponse({ error: "pedido_id é obrigatório" }, 400, corsHeaders);

  const admin = adminClient();
  const eventKey = `nova_entrega:${pedidoId}`;

  // 1. Cancel the original notification when we still know its id.
  const { data: job } = await admin
    .from("notification_jobs")
    .select("id, onesignal_notification_id, status")
    .eq("event_key", eventKey)
    .maybeSingle();

  let cancelled = false;
  if (job?.onesignal_notification_id && getOneSignalConfig().configured) {
    cancelled = await cancelOneSignal(job.onesignal_notification_id);
  }
  if (job?.id) {
    await admin
      .from("notification_jobs")
      .update({ status: "cancelled", processed_at: new Date().toISOString() })
      .eq("id", job.id);
  }

  // 2. Silent sync push to every other driver device.
  const { data: pedido } = await admin
    .from("delivery_requests")
    .select("driver_id")
    .eq("id", pedidoId)
    .maybeSingle();

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("onesignal_subscription_id, user_id")
    .eq("profile_type", "driver")
    .eq("active", true)
    .eq("subscription_status", "subscribed")
    .eq("permission_status", "granted");

  const ids = Array.from(
    new Set(
      (subs ?? [])
        .filter((s: any) => !pedido?.driver_id || s.user_id !== pedido.driver_id)
        .map((s: any) => s.onesignal_subscription_id)
        .filter(Boolean),
    ),
  );

  let synced = 0;
  if (ids.length > 0 && getOneSignalConfig().configured) {
    for (const batch of chunk(ids)) {
      const result = await sendOneSignal({
        include_subscription_ids: batch,
        // Data-only: no headings/contents => no visible notification.
        content_available: true,
        data: {
          tipo: "entrega_indisponivel",
          pedido_id: pedidoId,
          acao: "remover",
        },
        collapse_id: `cancel:${pedidoId}`,
        ttl: 300,
        priority: 10,
      });
      synced += result.recipients;
    }
  }

  await logDelivery(admin, {
    pedido_id: pedidoId,
    event_type: "entrega_indisponivel",
    recipients_count: synced,
    onesignal_notification_id: job?.onesignal_notification_id ?? null,
    error_code: null,
  });

  console.log("[push] entrega invalidada", { pedido_id: pedidoId, cancelled, synced });

  return jsonResponse({ ok: true, cancelled, synced }, 200, corsHeaders);
});
