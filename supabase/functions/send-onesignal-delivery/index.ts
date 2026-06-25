// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const ONESIGNAL_APP_ID = "52d432a9-3b18-428f-ab87-eff19a2d5a6a";
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY")!;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      request_id,
      driver_id,
      driver_fee,
      pickup_address,
      delivery_address,
    } = body ?? {};

    // Find target external IDs: directed driver, or every online driver
    let externalIds: string[] = [];
    if (driver_id) {
      externalIds = [driver_id];
    } else {
      const { data: drivers, error } = await supabase
        .from("drivers")
        .select("user_id, is_online, is_active, last_seen_at")
        .eq("is_online", true)
        .eq("is_active", true);
      if (error) console.error("[PushNotifications] drivers query error", error);

      // Treat drivers seen in the last 5 min as truly online
      const cutoff = Date.now() - 5 * 60 * 1000;
      externalIds = (drivers ?? [])
        .filter((d: any) => !d.last_seen_at || new Date(d.last_seen_at).getTime() > cutoff)
        .map((d: any) => d.user_id)
        .filter(Boolean);
    }

    console.log("[PushNotifications] targets", externalIds.length, { request_id });

    if (externalIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no_online_drivers" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fee = Number(driver_fee ?? 0).toFixed(2);
    const payload = {
      app_id: ONESIGNAL_APP_ID,
      target_channel: "push",
      include_aliases: { external_id: externalIds },
      headings: { en: "Nova entrega disponível", pt: "Nova entrega disponível" },
      contents: {
        en: `R$ ${fee} • ${pickup_address ?? ""} → ${delivery_address ?? ""}`,
        pt: `R$ ${fee} • ${pickup_address ?? ""} → ${delivery_address ?? ""}`,
      },
      data: {
        type: "new_delivery",
        request_id,
        driver_fee,
        pickup_address,
        delivery_address,
        url: "/motorista",
      },
      url: "/motorista",
      android_channel_id: undefined,
      priority: 10,
      ttl: 120,
    };

    const res = await fetch("https://api.onesignal.com/notifications?c=push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[PushNotifications] OneSignal error", res.status, json);
      return new Response(JSON.stringify({ error: json, status: res.status }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[PushNotifications] sent", json);
    return new Response(
      JSON.stringify({ sent: externalIds.length, onesignal: json }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[PushNotifications] handler error", err);
    return new Response(JSON.stringify({ error: err?.message ?? "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
