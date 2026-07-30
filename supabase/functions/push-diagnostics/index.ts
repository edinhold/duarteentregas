/**
 * push-diagnostics — admin-only push health report.
 *
 * Two modes, both admin-only:
 *  - overview (no user_id / empty body): totals + readiness per driver;
 *  - detail (user_id informed): devices + recommendations for one user.
 *
 * Never returns credentials. Every failure answers with a typed JSON contract
 * so the frontend can show a useful message instead of a generic non-2xx.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getAndroidChannel, getOneSignalConfig, maskAppId } from "../_shared/onesignal.ts";
import { adminClient, jsonResponse, requireUser } from "../_shared/push-auth.ts";

const STALE_HOURS = 72;
const ONLINE_WINDOW_MS = 12 * 3600_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  console.log("[push-diagnostics:request]", {
    method: req.method,
    hasAuthorization: Boolean(req.headers.get("Authorization")),
  });

  try {
    const caller = await requireUser(req);
    if (!caller) {
      return jsonResponse(
        { ok: false, code: "UNAUTHENTICATED", error: "Sessão ausente ou expirada. Entre novamente." },
        401,
        corsHeaders,
      );
    }
    if (!caller.isAdmin) {
      return jsonResponse(
        { ok: false, code: "FORBIDDEN", error: "Apenas administradores podem ver o diagnóstico." },
        403,
        corsHeaders,
      );
    }

    // Body is optional — an empty body means "overview".
    let userId = "";
    try {
      const raw = await req.text();
      if (raw) userId = String(JSON.parse(raw)?.user_id ?? "").trim();
    } catch {
      userId = "";
    }

    const { appId, configured, missing } = getOneSignalConfig();
    console.log("[push-diagnostics:config]", {
      hasAppId: Boolean(appId),
      hasApiKey: configured,
    });

    const admin = adminClient();

    return userId
      ? await detail(admin, userId, appId, configured, missing)
      : await overview(admin, appId, configured, missing);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno desconhecido";
    console.error("[push-diagnostics:unexpected-error]", {
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return jsonResponse(
      { ok: false, code: "UNEXPECTED_EDGE_FUNCTION_ERROR", error: message },
      500,
      corsHeaders,
    );
  }
});

// ---------------------------------------------------------------------------

async function overview(
  admin: ReturnType<typeof adminClient>,
  appId: string,
  configured: boolean,
  missing: string[],
) {
  const [{ data: drivers, error: driversError }, { data: subs, error: subsError }] =
    await Promise.all([
      admin
        .from("drivers")
        .select("user_id, full_name, driver_code, is_online, last_seen_at, approval_status")
        .order("full_name", { ascending: true }),
      admin
        .from("push_subscriptions")
        .select("user_id, platform, active, permission_status, subscription_status, last_seen_at"),
    ]);

  if (driversError || subsError) {
    const error = driversError?.message ?? subsError?.message ?? "Falha ao consultar o banco.";
    console.error("[push-diagnostics:db-error]", { error });
    return jsonResponse({ ok: false, code: "DATABASE_ERROR", error }, 500, corsHeaders);
  }

  const byUser = new Map<string, any[]>();
  for (const s of subs ?? []) {
    const list = byUser.get(s.user_id) ?? [];
    list.push(s);
    byUser.set(s.user_id, list);
  }

  const rows = (drivers ?? []).map((d: any) => {
    const devices = byUser.get(d.user_id) ?? [];
    const activeDevices = devices.filter(
      (s) => s.active && s.subscription_status === "subscribed" && s.permission_status === "granted",
    );
    const approved = d.approval_status === "approved";
    const eligible = approved && activeDevices.length > 0;

    let reason = "Pronto para receber";
    if (!approved) reason = "Cadastro não aprovado";
    else if (devices.length === 0) reason = "Sem aparelho inscrito";
    else if (activeDevices.length === 0) reason = "Permissão negada ou inscrição inativa";

    const lastSub = devices
      .map((s) => s.last_seen_at)
      .filter(Boolean)
      .sort()
      .pop() ?? null;

    return {
      user_id: d.user_id,
      full_name: d.full_name ?? "—",
      driver_code: d.driver_code ?? null,
      is_online: Boolean(d.is_online),
      last_seen_at: d.last_seen_at ?? null,
      approval_status: d.approval_status ?? "pending",
      devices: devices.length,
      active_devices: activeDevices.length,
      platforms: Array.from(new Set(devices.map((s) => s.platform).filter(Boolean))),
      last_subscription_at: lastSub,
      eligible,
      reason,
    };
  });

  const now = Date.now();
  const totals = {
    drivers: rows.length,
    approved: rows.filter((r) => r.approval_status === "approved").length,
    with_device: rows.filter((r) => r.devices > 0).length,
    ready: rows.filter((r) => r.eligible).length,
    online: rows.filter(
      (r) => r.is_online || (r.last_seen_at && now - new Date(r.last_seen_at).getTime() < ONLINE_WINDOW_MS),
    ).length,
  };

  const recommendations: string[] = [];
  if (!configured) recommendations.push(`Credenciais ausentes no servidor: ${missing.join(", ")}.`);
  if (totals.drivers === 0) recommendations.push("Nenhum entregador cadastrado ainda.");
  if (totals.drivers > 0 && totals.with_device === 0) {
    recommendations.push(
      "Nenhum aparelho inscrito. Peça aos entregadores para abrir o app e tocar em “Ativar notificações”.",
    );
  }
  if (totals.approved > totals.ready) {
    recommendations.push(
      `${totals.approved - totals.ready} entregador(es) aprovado(s) sem aparelho pronto para receber alertas.`,
    );
  }

  return jsonResponse(
    {
      ok: true,
      configured,
      app_id_masked: maskAppId(appId),
      missing_secrets: missing,
      android_channel_id: getAndroidChannel().id,
      android_channel_mode: getAndroidChannel().mode,
      totals,
      drivers: rows,
      recommendations,
      checked_at: new Date().toISOString(),
    },
    200,
    corsHeaders,
  );
}

async function detail(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  appId: string,
  configured: boolean,
  missing: string[],
) {
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

  const recommendations: string[] = [];
  if (!configured) recommendations.push(`Credenciais ausentes no servidor: ${missing.join(", ")}.`);
  if (!isDriver) recommendations.push("Este usuário não possui o perfil de motorista.");
  if (driver && driver.approval_status !== "approved") {
    recommendations.push("O cadastro do motorista ainda não foi aprovado.");
  }
  if (profile?.suspended_until && new Date(profile.suspended_until).getTime() > Date.now()) {
    recommendations.push("O usuário está suspenso e não recebe novas entregas.");
  }
  if (deviceList.length === 0) {
    recommendations.push("Nenhum aparelho inscrito. Abra o aplicativo para sincronizar a inscrição.");
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
  if (
    deviceList.some(
      (d) => d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() > STALE_HOURS * 3600_000,
    )
  ) {
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
      getAndroidChannel().mode === "none"
        ? "APK: nenhum canal Android configurado — a notificação usa o canal padrão do OneSignal."
        : `APK: canal Android configurado (${getAndroidChannel().mode}). Confirme som e vibração no aparelho.`,
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
      android_channel_id: getAndroidChannel().id,
      android_channel_mode: getAndroidChannel().mode,
      credentials_configured: configured,
      devices: deviceList,
      recent_logs: lastLogs ?? [],
      recommendations,
      checked_at: new Date().toISOString(),
    },
    200,
    corsHeaders,
  );
}
