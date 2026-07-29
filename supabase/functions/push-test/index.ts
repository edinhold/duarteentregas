// push-test
// Admin-only: sends a diagnostic push to specific subscriptions and returns
// the real OneSignal result (never a blind "success").
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sendOneSignal } from "../_shared/onesignal.ts";

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
    const callerId = claims?.claims?.sub as string | undefined;
    if (!callerId) return json({ success: false, code: "UNAUTHORIZED" }, 401);

    const admin = createClient(url, service);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: callerId, _role: "admin" });
    if (!isAdmin) return json({ success: false, code: "FORBIDDEN" }, 403);

    const body = await req.json().catch(() => ({}));
    const targetUserId: string | undefined = body?.user_id;
    const subscriptionId: string | undefined = body?.subscription_id;
    const platform: string | undefined = body?.platform;
    const broadcastDrivers: boolean = Boolean(body?.all_drivers);

    let query = admin
      .from("push_subscriptions")
      .select("onesignal_subscription_id, user_id, platform, permission_status, subscription_status, last_seen_at")
      .eq("active", true);

    if (subscriptionId) query = query.eq("onesignal_subscription_id", subscriptionId);
    else if (targetUserId) query = query.eq("user_id", targetUserId);
    else if (broadcastDrivers) query = query.eq("profile_type", "driver");
    else return json({ success: false, code: "INVALID_INPUT", message: "Informe um destino" }, 400);

    if (platform) query = query.eq("platform", platform);

    const { data: subs, error } = await query;
    if (error) return json({ success: false, code: "DB_ERROR", message: error.message }, 500);

    const ids = Array.from(
      new Set((subs ?? []).map((s: any) => s.onesignal_subscription_id).filter(Boolean)),
    );

    if (ids.length === 0) {
      await admin.from("notification_delivery_logs").insert({
        event_type: "teste_push",
        platform: platform ?? "any",
        recipients_count: 0,
        error_code: "NO_RECIPIENTS",
        response_body_sanitized: { motivo: "nenhuma inscrição ativa encontrada" },
      });
      return json({
        success: false,
        code: "NO_RECIPIENTS",
        message: "Nenhuma inscrição ativa encontrada para o destino selecionado.",
        devices: [],
      });
    }

    const result = await sendOneSignal({
      include_subscription_ids: ids,
      headings: { pt: "🔔 Teste de notificação", en: "Push test" },
      contents: {
        pt: "O sistema de notificações está funcionando neste aparelho.",
        en: "Push notifications are working on this device.",
      },
      data: { tipo: "teste_push", rota: "/entregador" },
      url: `${Deno.env.get("APP_BASE_URL") ?? "https://duarteentregas.lovable.app"}/entregador`,
      android_channel_id: "novas_entregas_v1",
      android_sound: "entrega_nova",
      priority: 10,
      ttl: 300,
    });

    await admin.from("notification_delivery_logs").insert({
      event_type: "teste_push",
      platform: platform ?? "multi",
      recipients_count: result.recipients,
      onesignal_notification_id: result.notificationId,
      response_status: result.httpStatus,
      response_body_sanitized: result.sanitized,
      error_code: result.errorCode ?? null,
    });

    console.log("[push-test] resultado", {
      alvos: ids.length,
      recipients: result.recipients,
      status: result.httpStatus,
      code: result.errorCode,
    });

    return json({
      success: result.ok,
      code: result.errorCode ?? "SENT",
      targeted: ids.length,
      recipients: result.recipients,
      notification_id: result.notificationId,
      http_status: result.httpStatus,
      response: result.sanitized,
      sent_at: new Date().toISOString(),
      devices: (subs ?? []).map((s: any) => ({
        user_id: s.user_id,
        platform: s.platform,
        permission_status: s.permission_status,
        subscription_status: s.subscription_status,
        subscription_tail: String(s.onesignal_subscription_id).slice(-8),
        last_seen_at: s.last_seen_at,
      })),
    });
  } catch (err: any) {
    console.log("[push-test] erro", err?.message ?? err);
    return json({ success: false, code: "INTERNAL_ERROR", message: String(err?.message ?? err) }, 500);
  }
});
