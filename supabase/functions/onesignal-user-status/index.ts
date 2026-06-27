// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const ONESIGNAL_APP_ID = "52d432a9-3b18-428f-ab87-eff19a2d5a6a";
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY")!;

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
    const { external_id } = await req.json().catch(() => ({}));
    if (!external_id) {
      return new Response(JSON.stringify({ error: "missing external_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${encodeURIComponent(external_id)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
        Accept: "application/json",
      },
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          error: json?.errors ?? `http_${res.status}`,
          status: res.status,
          raw: json,
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
