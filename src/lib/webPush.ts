import { supabase } from "@/integrations/supabase/client";

export const VAPID_PUBLIC_KEY =
  "BGD2qLXHzweaz5XIUEc5dlsTDCjt0_6cg7wFTRLhDjZ714TOWlfTMRXRcyz5ffHjuI58A2YpHgFXlOqCRWAQK0E";

const SW_URL = "/push-sw.js";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufToB64(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function getOrRegisterSW(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  if (existing) return existing;
  return await navigator.serviceWorker.register(SW_URL, { scope: "/" });
}

export async function enableWebPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };

  if (Notification.permission === "default") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, reason: "denied" };
  } else if (Notification.permission !== "granted") {
    return { ok: false, reason: "denied" };
  }

  const reg = await getOrRegisterSW();
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  }

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return { ok: false, reason: "not-authenticated" };

  const json: any = sub.toJSON();
  const endpoint = json.endpoint as string;
  const p256dh = json.keys?.p256dh ?? bufToB64(sub.getKey("p256dh"));
  const authKey = json.keys?.auth ?? bufToB64(sub.getKey("auth"));

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint,
        p256dh,
        auth: authKey,
        user_agent: navigator.userAgent,
      },
      { onConflict: "endpoint" },
    );
  if (error) {
    console.error("push subscription save failed", error);
    return { ok: false, reason: "save-failed" };
  }
  return { ok: true };
}

export async function disableWebPush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    try {
      await sub.unsubscribe();
    } catch (_) {
      // ignore
    }
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  }
}
