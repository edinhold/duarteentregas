/**
 * push-diagnostics — admin-only device inspection for a given driver.
 *
 * Returns everything needed by the "Diagnosticar dispositivo" panel plus
 * plain-language recommendations. No credential is ever included.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { ANDROID_CHANNEL_ID, getOneSignalConfig, maskAppId } from "../_shared/onesignal.ts";
import { adminClient, jsonResponse, requireUser } from "../_shared/push-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await requireUser(req);
  if (!caller) return jsonResponse({ error: "Não autenticado" }, 401, corsHeaders);
  if (!caller.isAdmin) return jsonResponse({ error: "Apenas administradores" }, 403, corsHeaders);

  let userId = "";
  try {
    userId = String((await req.json())?.user_id ?? "").trim();
  } catch {
    return jsonResponse({ error: "Corpo inválido" }, 400, corsHeaders);
  }
  if (!userId) return jsonResponse({ error: "user_id é obrigatório" }, 400, corsHeaders);

  const admin = adminClient();
  const { appId, configured, missing } = getOneSignalConfig();

  const [{ data: driver }, { data: profile }, { data: roles }, { data: devices }, { data: lastLogs }] =
    await Promise.all([
      admin
        .from("drivers")
        .select("id, full_name, is_active, is_online, last_seen_at, approval_status")
        .eq("user_id", userId)
        .maybeSingle(),
      admin.from("profiles").select("full_name, suspended_until").eq("user_id", userId).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", userId),
      admin
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", userId)
        .order("last_seen_at", { ascending: false }),
      admin
        .from("notification_delivery_logs")
        .select("event_type, recipients_count, response_status, error_code, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const isDriver = (roles ?? []).some((r: any) => r.role === "driver");
  const deviceList = (devices ?? []).map((d: any) => ({
    id: d.id,
    platform: d.platform,
    device_type: d.device_type,
    permission_status: d.permission_status,
    subscription_status: d.subscription_status,
    active: d.active,
    subscription_tail: String(d.onesignal_subscription_id).slice(-8),
    has_external_id: Boolean(d.onesignal_external_id),
    app_version: d.app_version,
    device_model: d.device_model,
    last_seen_at: d.last_seen_at,
  }));

  // ---- Recommendations ---------------------------------------------------
  const recommendations: string[] = [];
  const STALE_HOURS = 72;

  if (!configured) {
    recommendations.push(`Credenciais ausentes no servidor: ${missing.join(", ")}.`);
  }
  if (!isDriver) {
    recommendations.push("Este usuário não possui o perfil de motorista.");
  }
  if (driver && driver.approval_status !== "approved") {
    recommendations.push("O cadastro do motorista ainda não foi aprovado.");
  }
  if (profile?.suspended_until && new Date(profile.suspended_until).getTime() > Date.now()) {
    recommendations.push("O usuário está suspenso e não recebe novas entregas.");
  }
  if (deviceList.length === 0) {
    recommendations.push(
      "Nenhum aparelho inscrito. Abra o aplicativo para sincronizar a inscrição.",
    );
  }
  if (deviceList.some((d) => d.permission_status === "denied")) {
    recommendations.push("Ative a permissão de notificações nas configurações do aparelho.");
  }
  if (deviceList.some((d) => d.permission_status === "default")) {
    recommendations.push("A permissão ainda não foi solicitada — toque em “Ativar notificações”.");
  }
  if (deviceList.length > 0 && deviceList.every((d) => !d.active)) {
    recommendations.push("O dispositivo está desinscrito. Reabra o aplicativo para reinscrever.");
  }
  if (deviceList.some((d) => !d.has_external_id)) {
    recommendations.push("Inscrição sem vínculo de usuário. Saia e entre novamente no aplicativo.");
  }
  const stale = deviceList.filter(
    (d) => d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() > STALE_HOURS * 3600_000,
  );
  if (stale.length > 0) {
    recommendations.push(
      "Inscrição sem sincronizar há dias. Abra o aplicativo; a economia de bateria pode estar atrasando os alertas.",
    );
  }
  if (deviceList.some((d) => d.platform === "web_pwa")) {
    recommendations.push(
      "PWA: se nada chegar, limpe o service worker antigo e reinstale o atalho na tela inicial.",
    );
  }
  if (deviceList.some((d) => d.platform === "android_apk")) {
    recommendations.push(
      `APK: confirme que o canal “Novas entregas” (${ANDROID_CHANNEL_ID}) está ativo com som e vibração.`,
    );
  }
  if (recommendations.length === 0) {
    recommendations.push("Nenhum problema detectado nas inscrições deste usuário.");
  }

  return jsonResponse(
    {
      ok: true,
      user_id: userId,
      name: driver?.full_name ?? profile?.full_name ?? null,
      is_driver: isDriver,
      approval_status: driver?.approval_status ?? null,
      is_active: driver?.is_active ?? null,
      is_online: driver?.is_online ?? null,
      driver_last_seen_at: driver?.last_seen_at ?? null,
      suspended_until: profile?.suspended_until ?? null,
      onesignal_app_id_masked: maskAppId(appId),
      android_channel_id: ANDROID_CHANNEL_ID,
      credentials_configured: configured,
      devices: deviceList,
      recent_logs: lastLogs ?? [],
      recommendations,
      checked_at: new Date().toISOString(),
    },
    200,
    corsHeaders,
  );
});
