// notify-available-drivers
// Backend trigger: sends the "new delivery" push to every eligible driver device.
// Called right after a delivery request is committed to the database.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendOneSignal } from "../_shared/onesignal.ts";

const ANDROID_CHANNEL_ID = "novas_entregas_v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ success: false, code: "UNAUTHORIZED" }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsError || !claims?.claims?.sub) {
      return json({ success: false, code: "UNAUTHORIZED" }, 401);
    }
    const callerId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const pedidoId: string | undefined = body?.pedido_id;
    if (!pedidoId || typeof pedidoId !== "string") {
      return json({ success: false, code: "INVALID_INPUT", message: "pedido_id obrigatório" }, 400);
    }

    const admin = createClient(url, service);

    const { data: pedido, error: pedidoError } = await admin
      .from("delivery_requests")
      .select("id, status, driver_id, store_owner_id, pickup_address, delivery_address, driver_fee, restaurant_id")
      .eq("id", pedidoId)
      .maybeSingle();

    if (pedidoError || !pedido) {
      return json({ success: false, code: "PEDIDO_NAO_ENCONTRADO" }, 404);
    }

    // Only the owner of the request or an admin may trigger the broadcast.
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: callerId,
      _role: "admin",
    });
    if (pedido.store_owner_id !== callerId && !isAdmin) {
      return json({ success: false, code: "FORBIDDEN" }, 403);
    }

    if (pedido.status !== "pending") {
      return json({ success: false, code: "PEDIDO_INDISPONIVEL", status: pedido.status });
    }

    const eventKey = `nova_entrega:${pedidoId}`;

    // Idempotency lock: only the first caller creates the job.
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

    if (jobError || !job) {
      console.log("[notify] evento já processado", eventKey, jobError?.message);
      return json({ success: true, code: "JA_ENVIADO", event_key: eventKey });
    }

    // ---- Eligible drivers ----------------------------------------------
    // A directed request goes only to the chosen driver.
    let driverUserIds: string[] = [];
    if (pedido.driver_id) {
      driverUserIds = [pedido.driver_id];
    } else {
      const { data: drivers } = await admin
        .from("drivers")
        .select("user_id, is_active, is_online, approval_status")
        .eq("is_active", true)
        .eq("approval_status", "approved");
      const all = (drivers ?? []).map((d: any) => d.user_id);
      const online = (drivers ?? []).filter((d: any) => d.is_online).map((d: any) => d.user_id);
      // Prefer online drivers; fall back to every approved driver so a stale
      // presence flag never silences the broadcast.
      driverUserIds = online.length > 0 ? online : all;
    }

    // Suspended accounts never receive offers.
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

    let subscriptionIds: string[] = [];
    if (driverUserIds.length > 0) {
      const { data: subs } = await admin
        .from("push_subscriptions")
        .select("onesignal_subscription_id")
        .in("user_id", driverUserIds)
        .eq("active", true)
        .eq("subscription_status", "subscribed");
      subscriptionIds = Array.from(
        new Set((subs ?? []).map((s: any) => s.onesignal_subscription_id).filter(Boolean)),
      );
    }

    const logBase = {
      pedido_id: pedidoId,
      event_type: "nova_entrega",
      recipients_count: 0,
    };

    if (subscriptionIds.length === 0) {
      await admin
        .from("notification_jobs")
        .update({ status: "no_recipients", processed_at: new Date().toISOString() })
        .eq("id", job.id);
      await admin.from("notification_delivery_logs").insert({
        ...logBase,
        error_code: "NO_RECIPIENTS",
        response_body_sanitized: { drivers_elegiveis: driverUserIds.length },
      });
      console.log("[notify] nenhum dispositivo inscrito", { pedidoId, drivers: driverUserIds.length });
      return json({
        success: false,
        code: "NO_RECIPIENTS",
        drivers_eligible: driverUserIds.length,
        subscriptions: 0,
      });
    }

    const fee = Number(pedido.driver_fee ?? 0).toFixed(2);
    const results: any[] = [];
    let totalRecipients = 0;
    let lastNotificationId: string | null = null;
    let lastStatus = 0;
    let lastError: string | undefined;

    // OneSignal accepts up to 20.000 subscription ids per call; batch anyway.
    for (let i = 0; i < subscriptionIds.length; i += 2000) {
      const batch = subscriptionIds.slice(i, i + 2000);
      const result = await sendOneSignal({
        include_subscription_ids: batch,
        headings: { pt: "🚚 Nova entrega disponível", en: "New delivery available" },
        contents: {
          pt: `Frete R$ ${fee} — toque para visualizar.`,
          en: `Delivery fee R$ ${fee} — tap to view.`,
        },
        data: {
          tipo: "nova_entrega",
          pedido_id: pedido.id,
          rota: `/entregador?entrega=${pedido.id}`,
          evento_id: eventKey,
        },
        url: `${Deno.env.get("APP_BASE_URL") ?? "https://duarteentregas.lovable.app"}/entregador?entrega=${pedido.id}`,
        android_channel_id: ANDROID_CHANNEL_ID,
        android_sound: "entrega_nova",
        priority: 10,
        ttl: 900,
        android_visibility: 1,
        buttons: [{ id: "ver_entrega", text: "Ver entrega" }],
      });
      totalRecipients += result.recipients;
      lastNotificationId = result.notificationId ?? lastNotificationId;
      lastStatus = result.httpStatus;
      if (result.errorCode) lastError = result.errorCode;
      results.push(result.sanitized);

      await admin.from("notification_delivery_logs").insert({
        pedido_id: pedidoId,
        event_type: "nova_entrega",
        platform: "multi",
        recipients_count: result.recipients,
        onesignal_notification_id: result.notificationId,
        response_status: result.httpStatus,
        response_body_sanitized: result.sanitized,
        error_code: result.errorCode ?? null,
      });
    }

    const finalStatus = totalRecipients > 0 ? "sent" : lastError === "NO_RECIPIENTS" ? "no_recipients" : "failed";
    await admin
      .from("notification_jobs")
      .update({
        status: finalStatus,
        recipients_count: totalRecipients,
        onesignal_notification_id: lastNotificationId,
        last_error: lastError ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (lastNotificationId) {
      await admin
        .from("delivery_requests")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", pedidoId);
    }

    console.log("[notify] envio concluído", {
      pedidoId,
      drivers: driverUserIds.length,
      subscriptions: subscriptionIds.length,
      recipients: totalRecipients,
      status: lastStatus,
    });

    return json({
      success: totalRecipients > 0,
      code: totalRecipients > 0 ? "SENT" : (lastError ?? "FAILED"),
      drivers_eligible: driverUserIds.length,
      subscriptions: subscriptionIds.length,
      recipients: totalRecipients,
      notification_id: lastNotificationId,
      http_status: lastStatus,
      response: results,
    });
  } catch (err: any) {
    console.log("[notify] erro inesperado", err?.message ?? err);
    return json({ success: false, code: "INTERNAL_ERROR", message: String(err?.message ?? err) }, 500);
  }
});
