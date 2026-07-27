// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY =
  "BGD2qLXHzweaz5XIUEc5dlsTDCjt0_6cg7wFTRLhDjZ714TOWlfTMRXRcyz5ffHjuI58A2YpHgFXlOqCRWAQK0E";
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
        .eq("is_active", true)
        .eq("approval_status", "approved");
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
      title: "🚚 Nova entrega disponível",
      body: "Você recebeu uma nova entrega. Toque para visualizar.",
      data: {
        request_id,
        driver_fee,
        pickup_address,
        delivery_address,
        url: "/entregador",
      },
    });

    // Deduplicate endpoints so the same device is never notified twice.
    const seen = new Set<string>();

    let sent = 0;
    const deadIds: string[] = [];

    await Promise.all(
      (subs ?? []).map(async (s: any) => {
        if (seen.has(s.endpoint)) return;
        seen.add(s.endpoint);
        const send = () =>
          webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 30, urgency: "high" },
          );
        try {
          await send();
          sent++;
        } catch (err: any) {
          const code = err?.statusCode;
          if (code === 404 || code === 410) {
            deadIds.push(s.id);
            console.error("[WebPush] subscription gone", { user_id: s.user_id, code });
            return;
          }
          console.error("[WebPush] send failed, retrying once", {
            user_id: s.user_id, code, body: err?.body ?? err?.message, request_id,
          });
          // Retry exactly once for transient failures.
          try {
            await send();
            sent++;
          } catch (err2: any) {
            console.error("[WebPush] retry failed", {
              user_id: s.user_id, code: err2?.statusCode, body: err2?.body ?? err2?.message, request_id,
            });
          }
        }
      }),
    );

    if (deadIds.length) {
      await supabase.from("push_subscriptions").delete().in("id", deadIds);
    }

    console.log("[WebPush] delivery call dispatched", {
      at: new Date().toISOString(), request_id, targets: targetUserIds.length, sent, removed: deadIds.length,
    });

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
