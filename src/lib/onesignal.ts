import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export const ONESIGNAL_APP_ID = "52d432a9-3b18-428f-ab87-eff19a2d5a6a";

declare global {
  interface Window {
    OneSignal?: any;
    OneSignalDeferred?: any[];
  }
}

let nativeInitPromise: Promise<any> | null = null;
let webInitPromise: Promise<void> | null = null;

function log(...args: any[]) {
  try { console.log("[OneSignal]", ...args); } catch {}
}
function warn(...args: any[]) {
  try { console.warn("[OneSignal]", ...args); } catch {}
}

/** Notifies the app that a delivery is no longer available (silent sync event). */
export function emitDeliveryUnavailable(pedidoId?: string | null) {
  try {
    log("entrega_indisponivel", pedidoId);
    window.dispatchEvent(new CustomEvent("delivery-unavailable", { detail: { pedidoId: pedidoId ?? null } }));
  } catch {}
}



function err(...args: any[]) {
  try { console.error("[OneSignal]", ...args); } catch {}
}

function isPreviewOrIframe(): boolean {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  if (window.self !== window.top) return true;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host.endsWith(".lovableproject.com") || host === "lovableproject.com") return true;
  if (host.endsWith(".lovableproject-dev.com")) return true;
  if (host.endsWith(".beta.lovable.dev")) return true;
  return false;
}

// ---------------- NATIVE (Android/iOS via Capacitor + Cordova plugin) ----------------

async function initOneSignalNative(): Promise<any> {
  if (nativeInitPromise) return nativeInitPromise;

  nativeInitPromise = (async () => {
    const mod = await import("onesignal-cordova-plugin");
    const OneSignal: any = (mod as any).default ?? mod;

    try { OneSignal.Debug?.setLogLevel?.(5); } catch {}

    OneSignal.initialize(ONESIGNAL_APP_ID);
    log("SDK inicializado (native)", { appId: ONESIGNAL_APP_ID });

    try {
      OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event: any) => {
        const notification = event?.getNotification?.();
        const extra = notification?.additionalData ?? {};
        // Silent sync: another driver accepted — never display it.
        if (extra?.tipo === "entrega_indisponivel") {
          try { event?.preventDefault?.(); } catch {}
          emitDeliveryUnavailable(extra?.pedido_id);
          try { OneSignal.Notifications?.removeNotification?.(notification?.androidNotificationId); } catch {}
          return;
        }
        try { event?.preventDefault?.(); } catch {}
        try { notification?.display?.(); } catch {}
        try { if ("vibrate" in navigator) navigator.vibrate?.([400, 200, 400]); } catch {}
      });
    } catch (e) { warn("foreground listener failed", e); }

    try {
      OneSignal.Notifications.addEventListener("click", (event: any) => {
        log("native click", event);
        const extra = event?.notification?.additionalData ?? {};
        if (extra?.tipo === "entrega_indisponivel") {
          emitDeliveryUnavailable(extra?.pedido_id);
          return;
        }
        const url = extra.url || extra.rota || "/entregador";
        if (typeof window !== "undefined") window.location.assign(url === "/motorista/pedido" ? "/entregador" : url);
      });
    } catch {}


    return OneSignal;
  })();

  return nativeInitPromise;
}

// ---------------- WEB ----------------

async function initOneSignalWeb(): Promise<void> {
  if (webInitPromise) return webInitPromise;
  if (typeof window === "undefined") return;
  if (isPreviewOrIframe()) {
    log("skipping Web init in preview/iframe host", window.location.hostname);
    return;
  }

  webInitPromise = new Promise<void>((resolve) => {
    if (!document.querySelector('script[data-onesignal-sdk]')) {
      const s = document.createElement("script");
      s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
      s.defer = true;
      s.dataset.onesignalSdk = "true";
      document.head.appendChild(s);
    }
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          serviceWorkerPath: "OneSignalSDKWorker.js",
          serviceWorkerParam: { scope: "/" },
          allowLocalhostAsSecureOrigin: true,
          notifyButton: { enable: false },
        });
        try {
          OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event: any) => {
            const extra = event?.notification?.additionalData ?? {};
            if (extra?.tipo === "entrega_indisponivel") {
              try { event?.preventDefault?.(); } catch {}
              emitDeliveryUnavailable(extra?.pedido_id);
            }
          });
        } catch {}
        OneSignal.Notifications.addEventListener("click", (event: any) => {
          log("web click", event);
          const extraData = event?.notification?.additionalData ?? {};
          if (extraData?.tipo === "entrega_indisponivel") {
            emitDeliveryUnavailable(extraData?.pedido_id);
            return;
          }

          try {
            const url = event?.notification?.additionalData?.url || event?.notification?.additionalData?.rota || "/entregador";
            window.location.assign(url === "/motorista/pedido" ? "/entregador" : url);
          } catch {}
        });
        log("SDK inicializado (web)", { appId: ONESIGNAL_APP_ID });
        resolve();
      } catch (e) {
        err("Web init failed", e);
        resolve();
      }
    });
  });

  return webInitPromise;
}

// ---------------- Public API ----------------

export async function initOneSignal(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await initOneSignalNative();
      return;
    }
    await initOneSignalWeb();
  } catch (e) {
    err("initialization failed", e);
  }
}

export async function requestOneSignalPermission(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const OneSignal = await initOneSignalNative();
      const granted = await OneSignal.Notifications.requestPermission(true);
      log("Permission (native):", granted);
      if (granted) {
        try { OneSignal.User?.pushSubscription?.optIn?.(); log("optIn called"); } catch (e) { warn("optIn failed", e); }
      }
      return !!granted;
    }
    if (typeof window === "undefined" || isPreviewOrIframe()) return false;
    await initOneSignalWeb();
    return await new Promise<boolean>((resolve) => {
      window.OneSignalDeferred!.push(async (OneSignal: any) => {
        try {
          const granted = await OneSignal.Notifications.requestPermission(true);
          log("Permission (web):", granted);
          try { OneSignal.User?.PushSubscription?.optIn?.(); } catch {}
          resolve(!!granted);
        } catch (e) {
          err("web requestPermission failed", e);
          resolve(false);
        }
      });
    });
  } catch (e) {
    err("requestPermission error", e);
    return false;
  }
}

export async function setOneSignalExternalUserId(userId: string): Promise<void> {
  if (!userId) return;
  try {
    if (Capacitor.isNativePlatform()) {
      const OneSignal = await initOneSignalNative();
      try { OneSignal.User?.pushSubscription?.optIn?.(); } catch {}
      OneSignal.login(userId);
      log("External ID vinculado (native):", userId);
      return;
    }
    if (typeof window === "undefined" || isPreviewOrIframe()) return;
    await initOneSignalWeb();
    window.OneSignalDeferred!.push((OneSignal: any) => {
      try {
        OneSignal.login(userId);
        log("External ID vinculado (web):", userId);
      } catch (e) { err("web login failed", e); }
    });
  } catch (e) {
    err("login failed", e);
  }
}

export async function clearOneSignalExternalUserId(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      const OneSignal = await initOneSignalNative();
      OneSignal.logout();
      log("Logout (native)");
      return;
    }
    if (typeof window === "undefined" || isPreviewOrIframe()) return;
    if (!window.OneSignalDeferred) return;
    window.OneSignalDeferred.push((OneSignal: any) => {
      try { OneSignal.logout(); log("Logout (web)"); } catch (e) { err("web logout failed", e); }
    });
  } catch (e) { err("logout failed", e); }
}

export async function setOneSignalTags(tags: Record<string, string>): Promise<void> {
  if (!tags || Object.keys(tags).length === 0) return;
  try {
    if (Capacitor.isNativePlatform()) {
      const OneSignal = await initOneSignalNative();
      try { OneSignal.User?.addTags?.(tags); log("Tags aplicadas (native)", tags); }
      catch (e) { warn("native addTags failed", e); }
      return;
    }
    if (typeof window === "undefined" || isPreviewOrIframe()) return;
    await initOneSignalWeb();
    window.OneSignalDeferred!.push((OneSignal: any) => {
      try { OneSignal.User?.addTags?.(tags); log("Tags aplicadas (web)", tags); }
      catch (e) { warn("web addTags failed", e); }
    });
  } catch (e) { err("setTags failed", e); }
}

async function readSubscription(): Promise<{
  subscriptionId?: string | null;
  onesignalUserId?: string | null;
  optedIn?: boolean | null;
  permission?: any;
  platform: string;
}> {
  if (Capacitor.isNativePlatform()) {
    const OneSignal = await initOneSignalNative();
    return {
      subscriptionId: await OneSignal.User?.pushSubscription?.getIdAsync?.().catch(() => null),
      onesignalUserId: await OneSignal.User?.getOnesignalId?.().catch(() => null),
      optedIn: await OneSignal.User?.pushSubscription?.getOptedInAsync?.().catch(() => null),
      permission: await OneSignal.Notifications?.getPermissionAsync?.().catch(() => null),
      platform: Capacitor.getPlatform() || "native",
    };
  }
  if (typeof window === "undefined" || isPreviewOrIframe()) return { platform: "web" };
  await initOneSignalWeb();
  return await new Promise((resolve) => {
    window.OneSignalDeferred!.push(async (OneSignal: any) => {
      resolve({
        subscriptionId: OneSignal.User?.PushSubscription?.id ?? null,
        onesignalUserId: OneSignal.User?.onesignalId ?? null,
        optedIn: OneSignal.User?.PushSubscription?.optedIn ?? null,
        permission: typeof Notification !== "undefined" ? Notification.permission : null,
        platform: "web",
      });
    });
  });
}

async function syncDeviceToSupabase(userId: string, info: Awaited<ReturnType<typeof readSubscription>>) {
  try {
    if (!info?.subscriptionId) {
      log("Sync ignorado: sem subscription_id ainda");
      return;
    }
    const payload = {
      user_id: userId,
      external_id: userId,
      subscription_id: info.subscriptionId,
      onesignal_user_id: info.onesignalUserId ?? null,
      platform: info.platform,
      status: info.optedIn === false ? "opted_out" : "active",
      last_synced_at: new Date().toISOString(),
    };
    const { error } = await (supabase as any)
      .from("onesignal_devices")
      .upsert(payload, { onConflict: "user_id,subscription_id" });
    if (error) warn("Supabase sync error", error);
    else log("Dispositivo sincronizado no Supabase", payload);
  } catch (e) {
    warn("syncDeviceToSupabase failed", e);
  }
}

/**
 * Full registration flow for an authenticated user.
 * Runs the correct sequence: init → login(externalId) → requestPermission → optIn
 * → addTags → read subscription → sync to Supabase, with verbose logs.
 */
export async function registerDeviceForUser(
  userId: string,
  tags: Record<string, string> = {},
): Promise<void> {
  if (!userId) { warn("registerDeviceForUser: userId ausente"); return; }
  log("registerDeviceForUser start", { userId, tags });
  try {
    await initOneSignal();
    await setOneSignalExternalUserId(userId);
    const granted = await requestOneSignalPermission();
    log("Permission granted?", granted);
    if (Object.keys(tags).length > 0) await setOneSignalTags(tags);

    // Poll subscription id up to ~10s (registration can take a moment on Android)
    let info = await readSubscription();
    let attempts = 0;
    while (!info?.subscriptionId && attempts < 10) {
      await new Promise((r) => setTimeout(r, 1000));
      info = await readSubscription();
      attempts++;
    }
    log("Push Subscription:", info);

    await syncDeviceToSupabase(userId, info);
  } catch (e) {
    err("registerDeviceForUser failed", e);
  }
}

export async function getOneSignalStatus(): Promise<{
  supported: boolean;
  permission?: boolean | NotificationPermission;
  externalId?: string | null;
  subscriptionId?: string | null;
  subscriptionToken?: string | null;
  optedIn?: boolean | null;
}> {
  try {
    if (Capacitor.isNativePlatform()) {
      const OneSignal = await initOneSignalNative();
      return {
        supported: true,
        permission: await OneSignal.Notifications.getPermissionAsync?.(),
        externalId: await OneSignal.User?.getExternalId?.(),
        subscriptionId: await OneSignal.User?.pushSubscription?.getIdAsync?.(),
        subscriptionToken: await OneSignal.User?.pushSubscription?.getTokenAsync?.(),
        optedIn: await OneSignal.User?.pushSubscription?.getOptedInAsync?.(),
      };
    }
    if (typeof window === "undefined" || isPreviewOrIframe()) return { supported: false };
    await initOneSignalWeb();
    return await new Promise((resolve) => {
      window.OneSignalDeferred!.push(async (OneSignal: any) => {
        resolve({
          supported: true,
          permission: typeof Notification !== "undefined" ? Notification.permission : undefined,
          externalId: await OneSignal.User?.getExternalId?.(),
          subscriptionId: await OneSignal.User?.PushSubscription?.id,
          optedIn: await OneSignal.User?.PushSubscription?.optedIn,
        });
      });
    });
  } catch (e) {
    err("status failed", e);
    return { supported: false };
  }
}
