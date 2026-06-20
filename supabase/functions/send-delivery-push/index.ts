// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY =
  "BDHuP4e-ussnQbRWq8j8B_Tfx4FAnuIFIM6tRjVT8NlJtRDOgRkecwN2qykzd48gLPrXMhdOD1M-x1F0p5kD-kM";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

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

    // Resolve target user IDs: directed driver, or all active drivers
    let targetUserIds: string[] = [];
    if (driver_id) {
      targetUserIds = [driver_id];
    } else {
      const { data: drivers } = await supabase
        .from("drivers")
        .select("user_id")
        .eq("is_active", true);
      targetUserIds = (drivers ?? []).map((d: any) => d.user_id).filter(Boolean);
    }

    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth,user_id")
      .in("user_id", targetUserIds);

    const payload = JSON.stringify({
      title: "Nova entrega disponível",
      body: `R$ ${Number(driver_fee ?? 0).toFixed(2)} • ${pickup_address ?? ""} → ${delivery_address ?? ""}`,
      data: { request_id, url: "/motorista" },
    });

    let sent = 0;
    const deadIds: string[] = [];

    await Promise.all(
      (subs ?? []).map(async (s: any) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 60, urgency: "high" },
          );
          sent++;
        } catch (err: any) {
          const code = err?.statusCode;
          if (code === 404 || code === 410) deadIds.push(s.id);
          console.error("push fail", code, err?.body ?? err?.message);
        }
      }),
    );

    if (deadIds.length) {
      await supabase.from("push_subscriptions").delete().in("id", deadIds);
    }

    return new Response(JSON.stringify({ sent, removed: deadIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err?.message ?? "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
