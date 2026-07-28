// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  configErrorResponse,
  getOneSignalConfig,
  oneSignalHeaders,
  readOneSignalResponse,
  safeOneSignalLogConfig,
  summarizeOneSignalUser,
} from "../_shared/onesignal.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, serviceRoleKey);

// OneSignal device_type codes we care about
const DEVICE_TYPE_LABEL: Record<string, string> = {
  "0": "iOS",
  "1": "Android",
  "5": "Chrome (Web)",
  "7": "Safari (Web)",
  "8": "Firefox (Web)",
  "9": "macOS",
  "10": "Windows",
  "11": "Edge (Web)",
  "ChromePush": "Chrome (Web)",
  "FirefoxPush": "Firefox (Web)",
  "SafariPush": "Safari (Web)",
  "iOSPush": "iOS",
  "AndroidPush": "Android",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const configResult = getOneSignalConfig();
    if (!configResult.ok) {
      const response = configErrorResponse(configResult);
      return new Response(response.body, {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { config } = configResult;

    const { external_id } = await req.json().catch(() => ({}));
    if (!external_id) {
      return new Response(JSON.stringify({ error: "missing external_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `https://api.onesignal.com/apps/${config.appId}/users/by/external_id/${encodeURIComponent(external_id)}`;
    console.log("[OneSignal:UserStatusRequest]", {
      external_id,
      endpoint: url,
      config: safeOneSignalLogConfig(config),
    });
    const res = await fetch(url, {
      headers: oneSignalHeaders(config),
    });
    const json = await readOneSignalResponse(res);
    console.log("[OneSignal:UserStatusResponse]", {
      status: res.status,
      ok: res.ok,
      body: summarizeOneSignalUser(json),
      endpoint: url,
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          error: json?.errors ?? `http_${res.status}`,
          message: res.status === 401
            ? "REST API Key inválida, ausente ou com prefixo incorreto. Use a REST API Key do aplicativo OneSignal configurado."
            : res.status === 403
              ? "Acesso negado pelo OneSignal: REST API Key não pertence a este App ID ou não tem permissão."
              : "Falha ao consultar inscrição no OneSignal.",
          status: res.status,
          raw: json,
          endpoint: url,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const subscriptions: any[] = Array.isArray(json?.subscriptions) ? json.subscriptions : [];
    const summary = subscriptions.map((s) => ({
      id: s.id,
      type: s.type,
      device_label: DEVICE_TYPE_LABEL[String(s.device_type ?? s.type ?? "")] ?? String(s.type ?? "?"),
      enabled: s.enabled,
      notification_types: s.notification_types, // 1 = subscribed, 0/negative = unsubscribed
      session_count: s.session_count,
      last_active: s.last_active,
      app_version: s.app_version,
      device_os: s.device_os,
      device_model: s.device_model,
    }));

    const activeSubscriptionIds = summary
      .filter((s) => s.enabled && (s.notification_types ?? 0) > 0)
      .map((s) => String(s.id ?? ""))
      .filter(Boolean);

    const { data: localDevices } = await (supabase as any)
      .from("onesignal_devices")
      .select("id,user_id,platform,status,permission_status,subscription_status,subscription_id,onesignal_subscription_id,push_token,device_model,app_version,last_synced_at")
      .eq("user_id", external_id)
      .order("last_synced_at", { ascending: false });

    if (activeSubscriptionIds.length > 0) {
      await (supabase as any)
        .from("onesignal_devices")
        .update({
          status: "active",
          subscription_status: "subscribed",
          permission_status: "granted",
          last_synced_at: new Date().toISOString(),
        })
        .eq("user_id", external_id)
        .in("subscription_id", activeSubscriptionIds);
    }

    const androidActive = summary.some(
      (s) => s.device_label === "Android" && s.enabled && (s.notification_types ?? 0) > 0,
    );
    const anyActive = summary.some((s) => s.enabled && (s.notification_types ?? 0) > 0);

    return new Response(
      JSON.stringify({
        external_id,
        android_active: androidActive,
        any_active: anyActive,
        subscriptions: summary,
        local_devices: localDevices ?? [],
        active_subscription_ids: activeSubscriptionIds,
        identity: json?.identity ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
