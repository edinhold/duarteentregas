// notify-available-drivers
// Backend trigger: sends the "new delivery" push to every eligible driver device.
// Called right after a delivery request is committed to the database.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendOneSignal } from "../_shared/onesignal.ts";

const ANDROID_CHANNEL_ID = "novas_entregas_v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  const requestId = crypto.randomUUID();

  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify({ ...body, request_id: requestId }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (req.method !== "POST") {
      return json({ success: false, code: "METHOD_NOT_ALLOWED", message: "Método não permitido." }, 405);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const appId = Deno.env.get("ONESIGNAL_APP_ID");
    const apiKey = Deno.env.get("ONESIGNAL_APP_API_KEY") ?? Deno.env.get("ONESIGNAL_REST_API_KEY");

    const missing = [
      ["SUPABASE_URL", url],
      ["SUPABASE_ANON_KEY", anon],
      ["SUPABASE_SERVICE_ROLE_KEY", service],
      ["ONESIGNAL_APP_ID", appId],
      ["ONESIGNAL_APP_API_KEY", apiKey],
    ].filter(([, v]) => !v).map(([k]) => k);

    if (missing.length > 0) {
      console.error("[notify] secrets ausentes", { requestId, missing });
      return json({
        success: false,
        code: "MISSING_SECRETS",
        message: `Configuração incompleta: ${missing.join(", ")}`,
      }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({
        success: false,
        code: "MISSING_AUTHORIZATION",
        message: "Sessão não encontrada. Entre novamente no sistema.",
      }, 401);
    }

    const userClient = createClient(url!, anon!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
    let callerId = claims?.claims?.sub as string | undefined;

    if (claimsError || !callerId) {
      const { data: userData, error: userError } = await userClient.auth.getUser(token);
      if (!userError && userData?.user?.id) callerId = userData.user.id;
    }

    if (!callerId) {
      return json({
        success: false,
        code: "INVALID_SESSION",
        message: "Sua sessão expirou ou é inválida. Entre novamente.",
      }, 401);
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ success: false, code: "INVALID_JSON", message: "Corpo da requisição inválido." }, 400);
    }

    const admin = createClient(url!, service!);

    // ---- Test mode (admin diagnostics) ----------------------------------
    if (body?.test_mode === true) {
      const { data: isAdminCaller } = await admin.rpc("has_role", { _user_id: callerId, _role: "admin" });
      if (!isAdminCaller) {
        return json({ success: false, code: "FORBIDDEN", message: "Apenas administradores." }, 403);
      }

      let testIds: string[] = [];
      const explicit = typeof body?.test_subscription_id === "string" ? body.test_subscription_id.trim() : "";
      if (explicit) {
        testIds = [explicit];
      } else {
        const { data: subs, error: subsErr } = await admin
          .from("push_subscriptions")
          .select("onesignal_subscription_id")
          .eq("profile_type", "driver")
          .eq("active", true)
          .eq("subscription_status", "subscribed");
        if (subsErr) {
          return json({
            success: false,
            code: "SUBSCRIPTIONS_QUERY_ERROR",
            message: "Não foi possível consultar os dispositivos.",
            details: subsErr.message,
          }, 500);
        }
        testIds = Array.from(
          new Set((subs ?? []).map((s: any) => s.onesignal_subscription_id).filter(Boolean)),
        );
      }

      if (testIds.length === 0) {
        await admin.from("notification_delivery_logs").insert({
          event_type: "teste_push",
          recipients_count: 0,
          error_code: "NO_RECIPIENTS",
          response_body_sanitized: { request_id: requestId },
        });
        return json({
          success: false,
          code: "NO_ACTIVE_SUBSCRIPTIONS",
          message: "Nenhum dispositivo ativo foi encontrado.",
          recipients: 0,
        });
      }

      const testResult = await sendOneSignal({
        include_subscription_ids: testIds,
        headings: { pt: "🔔 Teste de notificação", en: "Push test" },
        contents: {
          pt: "O sistema de notificações está funcionando neste aparelho.",
          en: "Push notifications are working on this device.",
        },
        data: { tipo: "teste_push", rota: "/entregador" },
        url: `${Deno.env.get("APP_BASE_URL") ?? "https://duarteentregas.lovable.app"}/entregador`,
        android_channel_id: ANDROID_CHANNEL_ID,
        priority: 10,
        ttl: 300,
      });

      await admin.from("notification_delivery_logs").insert({
        event_type: "teste_push",
        platform: "multi",
        recipients_count: testResult.recipients,
        onesignal_notification_id: testResult.notificationId,
        response_status: testResult.httpStatus,
        response_body_sanitized: testResult.sanitized,
        error_code: testResult.errorCode ?? null,
      });

      console.log("[notify] teste", {
        requestId,
        targeted: testIds.length,
        recipients: testResult.recipients,
        status: testResult.httpStatus,
        code: testResult.errorCode,
      });

      return json({
        success: testResult.ok,
        code: testResult.errorCode ?? "NOTIFICATION_ACCEPTED",
        message: testResult.ok
          ? "Notificação aceita pelo OneSignal. Verifique o aparelho."
          : "O OneSignal não entregou a notificação de teste.",
        targeted: testIds.length,
        recipients: testResult.recipients,
        notification_id: testResult.notificationId,
        http_status: testResult.httpStatus,
        response: testResult.sanitized,
      });
    }

    const pedidoId: string | undefined =
      typeof body?.pedido_id === "string" ? body.pedido_id.trim() : undefined;
    if (!pedidoId) {
      return json({ success: false, code: "MISSING_PEDIDO_ID", message: "O ID do pedido não foi informado." }, 400);
    }


    const { data: pedido, error: pedidoError } = await admin
      .from("delivery_requests")
      .select("id, status, driver_id, store_owner_id, pickup_address, delivery_address, driver_fee, restaurant_id")
      .eq("id", pedidoId)
      .maybeSingle();

    if (pedidoError || !pedido) {
      return json({ success: false, code: "ORDER_NOT_FOUND", message: "Pedido não encontrado." }, 404);
    }

    // Only the owner of the request or an admin may trigger the broadcast.
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: callerId,
      _role: "admin",
    });
    if (pedido.store_owner_id !== callerId && !isAdmin) {
      return json({ success: false, code: "FORBIDDEN", message: "Sem permissão para este pedido." }, 403);
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
