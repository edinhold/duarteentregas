// cancel-delivery-notification
// Called after a driver accepts (or the request is cancelled): removes the
// pending notification from the other devices and broadcasts a silent sync.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { cancelOneSignal, sendOneSignal } from "../_shared/onesignal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ success: false, code: "UNAUTHORIZED" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims?.sub) return json({ success: false, code: "UNAUTHORIZED" }, 401);

    const body = await req.json().catch(() => ({}));
    const pedidoId: string | undefined = body?.pedido_id;
    if (!pedidoId) return json({ success: false, code: "INVALID_INPUT" }, 400);

    const admin = createClient(url, service);

    const { data: job } = await admin
      .from("notification_jobs")
      .select("id, onesignal_notification_id, status")
      .eq("event_key", `nova_entrega:${pedidoId}`)
      .maybeSingle();

    let cancelled = false;
    if (job?.onesignal_notification_id) {
      cancelled = await cancelOneSignal(job.onesignal_notification_id);
      await admin
        .from("notification_jobs")
        .update({ status: "cancelled", processed_at: new Date().toISOString() })
        .eq("id", job.id);
    }

    // Silent sync so open apps drop the offer from their lists immediately.
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("onesignal_subscription_id")
      .eq("active", true)
      .eq("profile_type", "driver");
    const ids = Array.from(
      new Set((subs ?? []).map((s: any) => s.onesignal_subscription_id).filter(Boolean)),
    );

    let syncResult: any = { recipients: 0 };
    if (ids.length > 0) {
      syncResult = await sendOneSignal({
        include_subscription_ids: ids,
        content_available: true,
        data: { tipo: "entrega_indisponivel", pedido_id: pedidoId, acao: "remover" },
        collapse_id: `entrega-${pedidoId}`,
      });
    }

    await admin.from("notification_delivery_logs").insert({
      pedido_id: pedidoId,
      event_type: "entrega_indisponivel",
      recipients_count: syncResult?.recipients ?? 0,
      onesignal_notification_id: syncResult?.notificationId ?? null,
      response_status: syncResult?.httpStatus ?? null,
      response_body_sanitized: syncResult?.sanitized ?? {},
      error_code: syncResult?.errorCode ?? null,
    });

    console.log("[cancel] notificação invalidada", { pedidoId, cancelled, sync: syncResult?.recipients });
    return json({ success: true, cancelled, sync_recipients: syncResult?.recipients ?? 0 });
  } catch (err: any) {
    console.log("[cancel] erro", err?.message ?? err);
    return json({ success: false, code: "INTERNAL_ERROR", message: String(err?.message ?? err) }, 500);
  }
});
