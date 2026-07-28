import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export const ONESIGNAL_APP_ID = "52d432a9-3b18-428f-ab87-eff19a2d5a6a";

type DeviceInfo = {
  subscriptionId?: string | null;
  onesignalUserId?: string | null;
  pushToken?: string | null;
  optedIn?: boolean | null;
  permission?: boolean | NotificationPermission | string | null;
  platform: string;
  deviceModel?: string | null;
  appVersion?: string | null;
};

declare global {
  interface Window {
    OneSignal?: any;
    OneSignalDeferred?: any[];
    cordova?: any;
    device?: { model?: string; platform?: string; version?: string };
    isMedianApp: () => boolean;
  }
}

let nativeInitPromise: Promise<any> | null = null;
let webInitPromise: Promise<void> | null = null;
let observersAttached = false;
let currentUserId: string | null = null;
let currentTags: Record<string, string> = {};

function log(...args: any[]) {
  try { console.log("[OneSignal]", ...args); } catch {}
}

function warn(...args: any[]) {
  try { console.warn("[OneSignal]", ...args); } catch {}
}

function err(...args: any[]) {
  try { console.error("[OneSignal]", ...args); } catch {}
}

function isMedianRuntime(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (typeof window.isMedianApp === "function" && window.isMedianApp()) return true;
  } catch {}
  return /median|gonative|cordova/i.test(navigator.userAgent || "") || !!window.cordova;
}

function shouldUseNativeOneSignal(): boolean {
  return Capacitor.isNativePlatform() || isMedianRuntime();
}

function isPreviewOrIframe(): boolean {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  if (window.self !== window.top) return true;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host.endsWith(".lovableproject.com") || host === "lovableproject.com") return true;
  if (host.endsWith(".lovableproject-dev.com")) return true;
  return false;
}

function normalizePermission(value: DeviceInfo["permission"]): string {
  if (value === true) return "granted";
  if (value === false) return "denied";
  if (value === "granted" || value === "denied" || value === "default") return value;
  if (typeof Notification !== "undefined") return Notification.permission;
  return "unknown";
}

function subscriptionStatus(info: DeviceInfo): string {
  if (info.optedIn === false) return "unsubscribed";
  if (normalizePermission(info.permission) === "denied") return "unsubscribed";
  if (info.subscriptionId) return "subscribed";
  return "pending";
}

function currentPlatform(): string {
  if (Capacitor.isNativePlatform()) return Capacitor.getPlatform() || "native";
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const devicePlatform = window.device?.platform?.toLowerCase?.();
  if (devicePlatform?.includes("android") || /android/i.test(ua) || isMedianRuntime()) return "android";
  if (devicePlatform?.includes("ios") || /iphone|ipad|ipod/i.test(ua)) return "ios";
  return "web";
}

function waitForDeviceReady(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (Capacitor.isNativePlatform()) return Promise.resolve();
  if (!isMedianRuntime()) return Promise.resolve();

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      document.removeEventListener("deviceready", finish);
      resolve();
    };
    document.addEventListener("deviceready", finish, { once: true });
    // Median/Cordova sometimes loads the bridge before this bundle and the
    // event can already have fired. Continue after a short timeout instead of
    // blocking login/device sync forever.
    window.setTimeout(finish, 5000);
  });
}

/** Notifies the app that a delivery is no longer available (silent sync event). */
export function emitDeliveryUnavailable(pedidoId?: string | null) {
  try {
    log("entrega_indisponivel", pedidoId);
    window.dispatchEvent(new CustomEvent("delivery-unavailable", { detail: { pedidoId: pedidoId ?? null } }));
  } catch {}
}

function readEventSubscription(event: any): Partial<DeviceInfo> {
  const current = event?.current ?? event?.to ?? event?.subscription ?? event;
  return {
    subscriptionId: current?.id ?? current?.subscriptionId ?? null,
    pushToken: current?.token ?? current?.pushToken ?? null,
    optedIn: typeof current?.optedIn === "boolean" ? current.optedIn : null,
  };
}

async function attachNativeObservers(OneSignal: any) {
  if (observersAttached) return;
  observersAttached = true;

  try {
    OneSignal.Notifications?.addEventListener?.("foregroundWillDisplay", (event: any) => {
      const notification = event?.getNotification?.() ?? event?.notification;
      const extra = notification?.additionalData ?? notification?.additional_data ?? {};
      if (extra?.tipo === "entrega_indisponivel") {
        try { event?.preventDefault?.(); } catch {}
        emitDeliveryUnavailable(extra?.pedido_id ?? extra?.request_id);
        try { OneSignal.Notifications?.removeNotification?.(notification?.androidNotificationId); } catch {}
        return;
      }
      try { event?.preventDefault?.(); } catch {}
      try { notification?.display?.(); } catch {}
      try { navigator.vibrate?.([400, 200, 400]); } catch {}
    });
  } catch (e) { warn("foreground listener failed", e); }

  try {
    OneSignal.Notifications?.addEventListener?.("click", (event: any) => {
      const extra = event?.notification?.additionalData ?? event?.notification?.additional_data ?? {};
      if (extra?.tipo === "entrega_indisponivel") {
        emitDeliveryUnavailable(extra?.pedido_id ?? extra?.request_id);
        return;
      }
      const url = extra?.url || extra?.rota || "/entregador";
      window.location.assign(url === "/motorista/pedido" ? "/entregador" : url);
    });
  } catch (e) { warn("click listener failed", e); }

  try {
    OneSignal.User?.pushSubscription?.addEventListener?.("change", async (event: any) => {
      log("pushSubscription change", readEventSubscription(event));
      if (!currentUserId) return;
      const info = { ...(await readSubscription()), ...readEventSubscription(event) };
      await syncDeviceToDatabase(currentUserId, info, currentTags);
    });
  } catch (e) { warn("pushSubscription observer failed", e); }

  try {
    OneSignal.User?.addEventListener?.("change", async () => {
      if (!currentUserId) return;
      await syncDeviceToDatabase(currentUserId, await readSubscription(), currentTags);
    });
  } catch {}
}

async function initOneSignalNative(): Promise<any> {
  if (nativeInitPromise) return nativeInitPromise;

  nativeInitPromise = (async () => {
    await waitForDeviceReady();
    const mod = await import("onesignal-cordova-plugin");
    const OneSignal: any = (mod as any).default ?? mod;

    try { OneSignal.Debug?.setLogLevel?.(5); } catch {}
    try { OneSignal.initialize?.(ONESIGNAL_APP_ID); } catch (e) { warn("initialize native failed", e); }
    await attachNativeObservers(OneSignal);
    log("SDK inicializado (native/Median)", { appId: ONESIGNAL_APP_ID, platform: currentPlatform() });
    return OneSignal;
  })();

  return nativeInitPromise;
}

async function initOneSignalWeb(): Promise<void> {
  if (webInitPromise) return webInitPromise;
  if (typeof window === "undefined") return;
  if (isPreviewOrIframe()) {
    log("skipping Web init in preview/iframe host", window.location.hostname);
    return;
  }

  webInitPromise = new Promise<void>((resolve) => {
    if (!document.querySelector("script[data-onesignal-sdk]")) {
      const script = document.createElement("script");
      script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
      script.defer = true;
      script.dataset.onesignalSdk = "true";
      document.head.appendChild(script);
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
          OneSignal.Notifications?.addEventListener?.("foregroundWillDisplay", (event: any) => {
            const extra = event?.notification?.additionalData ?? {};
            if (extra?.tipo === "entrega_indisponivel") {
              try { event?.preventDefault?.(); } catch {}
              emitDeliveryUnavailable(extra?.pedido_id ?? extra?.request_id);
            }
          });
          OneSignal.Notifications?.addEventListener?.("click", (event: any) => {
            const extra = event?.notification?.additionalData ?? {};
            if (extra?.tipo === "entrega_indisponivel") {
              emitDeliveryUnavailable(extra?.pedido_id ?? extra?.request_id);
              return;
            }
            const url = extra?.url || extra?.rota || "/entregador";
            window.location.assign(url === "/motorista/pedido" ? "/entregador" : url);
          });
          OneSignal.User?.PushSubscription?.addEventListener?.("change", async () => {
            if (!currentUserId) return;
            await syncDeviceToDatabase(currentUserId, await readSubscription(), currentTags);
          });
        } catch {}

        log("SDK inicializado (web)", { appId: ONESIGNAL_APP_ID });
      } catch (e) {
        err("Web init failed", e);
      } finally {
        resolve();
      }
    });
  });

  return webInitPromise;
}

export async function initOneSignal(): Promise<void> {
  try {
    if (shouldUseNativeOneSignal()) {
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
    if (shouldUseNativeOneSignal()) {
      const OneSignal = await initOneSignalNative();
      const granted = await OneSignal.Notifications?.requestPermission?.(true);
      try { await OneSignal.User?.pushSubscription?.optIn?.(); } catch (e) { warn("native optIn failed", e); }
      log("Permission (native):", granted);
      return granted !== false;
    }

    if (typeof window === "undefined" || isPreviewOrIframe()) return false;
    await initOneSignalWeb();
    return await new Promise<boolean>((resolve) => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal: any) => {
        try {
          const granted = await OneSignal.Notifications?.requestPermission?.(true);
          try { await OneSignal.User?.PushSubscription?.optIn?.(); } catch {}
          log("Permission (web):", granted);
          resolve(granted !== false);
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
  currentUserId = userId;
  try {
    if (shouldUseNativeOneSignal()) {
      const OneSignal = await initOneSignalNative();
      try { await OneSignal.login?.(userId); } catch (e) { warn("native login failed", e); }
      try { await OneSignal.User?.pushSubscription?.optIn?.(); } catch {}
      log("External ID vinculado (native):", userId);
      return;
    }

    if (typeof window === "undefined" || isPreviewOrIframe()) return;
    await initOneSignalWeb();
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      try {
        await OneSignal.login?.(userId);
        log("External ID vinculado (web):", userId);
      } catch (e) { err("web login failed", e); }
    });
  } catch (e) {
    err("login failed", e);
  }
}

export async function clearOneSignalExternalUserId(): Promise<void> {
  currentUserId = null;
  currentTags = {};
  try {
    if (shouldUseNativeOneSignal()) {
      const OneSignal = await initOneSignalNative();
      try { await OneSignal.logout?.(); } catch {}
      log("Logout (native)");
      return;
    }

    if (typeof window === "undefined" || isPreviewOrIframe()) return;
    if (!window.OneSignalDeferred) return;
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      try { await OneSignal.logout?.(); log("Logout (web)"); } catch (e) { err("web logout failed", e); }
    });
  } catch (e) { err("logout failed", e); }
}

export async function setOneSignalTags(tags: Record<string, string>): Promise<void> {
  if (!tags || Object.keys(tags).length === 0) return;
  currentTags = { ...currentTags, ...tags };
  try {
    if (shouldUseNativeOneSignal()) {
      const OneSignal = await initOneSignalNative();
      try { await OneSignal.User?.addTags?.(tags); log("Tags aplicadas (native)", tags); }
      catch (e) { warn("native addTags failed", e); }
      return;
    }

    if (typeof window === "undefined" || isPreviewOrIframe()) return;
    await initOneSignalWeb();
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      try { await OneSignal.User?.addTags?.(tags); log("Tags aplicadas (web)", tags); }
      catch (e) { warn("web addTags failed", e); }
    });
  } catch (e) { err("setTags failed", e); }
}

async function readSubscription(): Promise<DeviceInfo> {
  if (shouldUseNativeOneSignal()) {
    const OneSignal = await initOneSignalNative();
    const subscription = OneSignal.User?.pushSubscription;
    return {
      subscriptionId: await subscription?.getIdAsync?.().catch(() => null),
      onesignalUserId: await OneSignal.User?.getOnesignalId?.().catch(() => null),
      pushToken: await subscription?.getTokenAsync?.().catch(() => null),
      optedIn: await subscription?.getOptedInAsync?.().catch(() => null),
      permission: await OneSignal.Notifications?.getPermissionAsync?.().catch(() => null),
      platform: currentPlatform(),
      deviceModel: window.device?.model ?? null,
      appVersion: navigator.appVersion ?? null,
    };
  }

  if (typeof window === "undefined" || isPreviewOrIframe()) return { platform: "web" };
  await initOneSignalWeb();
  return await new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      resolve({
        subscriptionId: OneSignal.User?.PushSubscription?.id ?? null,
        onesignalUserId: OneSignal.User?.onesignalId ?? null,
        pushToken: OneSignal.User?.PushSubscription?.token ?? null,
        optedIn: OneSignal.User?.PushSubscription?.optedIn ?? null,
        permission: typeof Notification !== "undefined" ? Notification.permission : null,
        platform: "web",
        appVersion: navigator.appVersion ?? null,
      });
    });
  });
}

async function syncDeviceToDatabase(userId: string, info: DeviceInfo, tags: Record<string, string>) {
  try {
    if (!info.subscriptionId) {
      log("Sync ignorado: sem Subscription ID ainda", info);
      return;
    }
    const profileType = tags.role ?? (tags.profile_type || "driver");
    const permissionStatus = normalizePermission(info.permission);
    const subStatus = subscriptionStatus(info);
    const payload = {
      user_id: userId,
      external_id: userId,
      onesignal_external_id: userId,
      subscription_id: info.subscriptionId,
      onesignal_subscription_id: info.subscriptionId,
      onesignal_user_id: info.onesignalUserId ?? null,
      push_token: info.pushToken ?? null,
      profile_type: profileType,
      platform: info.platform,
      status: subStatus === "subscribed" ? "active" : (permissionStatus === "denied" ? "opted_out" : "pending"),
      permission_status: permissionStatus,
      subscription_status: subStatus,
      device_model: info.deviceModel ?? null,
      app_version: info.appVersion ?? null,
      last_synced_at: new Date().toISOString(),
    };

    const { error } = await (supabase as any)
      .from("onesignal_devices")
      .upsert(payload, { onConflict: "user_id,subscription_id" });

    if (error) warn("Device sync error", error);
    else log("Dispositivo sincronizado", { ...payload, push_token: payload.push_token ? "present" : null });
  } catch (e) {
    warn("syncDeviceToDatabase failed", e);
  }
}

export async function registerDeviceForUser(
  userId: string,
  tags: Record<string, string> = {},
): Promise<void> {
  if (!userId) { warn("registerDeviceForUser: userId ausente"); return; }
  currentUserId = userId;
  currentTags = { ...currentTags, ...tags };
  log("registerDeviceForUser start", { userId, tags: currentTags, native: shouldUseNativeOneSignal() });

  try {
    await initOneSignal();
    await setOneSignalExternalUserId(userId);
    const granted = await requestOneSignalPermission();
    if (Object.keys(currentTags).length > 0) await setOneSignalTags(currentTags);
    log("Permission granted?", granted);

    let info = await readSubscription();
    for (let attempt = 0; !info.subscriptionId && attempt < 12; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      info = await readSubscription();
    }

    log("Push Subscription", { ...info, pushToken: info.pushToken ? "present" : null });
    await syncDeviceToDatabase(userId, info, currentTags);
  } catch (e) {
    err("registerDeviceForUser failed", e);
  }
}

export async function getOneSignalStatus(): Promise<{
  supported: boolean;
  permission?: boolean | NotificationPermission | string | null;
  externalId?: string | null;
  subscriptionId?: string | null;
  subscriptionToken?: string | null;
  optedIn?: boolean | null;
  platform?: string;
}> {
  try {
    if (shouldUseNativeOneSignal()) {
      const OneSignal = await initOneSignalNative();
      const subscription = OneSignal.User?.pushSubscription;
      return {
        supported: true,
        permission: await OneSignal.Notifications?.getPermissionAsync?.().catch(() => null),
        externalId: await OneSignal.User?.getExternalId?.().catch(() => currentUserId),
        subscriptionId: await subscription?.getIdAsync?.().catch(() => null),
        subscriptionToken: await subscription?.getTokenAsync?.().catch(() => null),
        optedIn: await subscription?.getOptedInAsync?.().catch(() => null),
        platform: currentPlatform(),
      };
    }

    if (typeof window === "undefined" || isPreviewOrIframe()) return { supported: false, platform: "web" };
    await initOneSignalWeb();
    return await new Promise((resolve) => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal: any) => {
        resolve({
          supported: true,
          permission: typeof Notification !== "undefined" ? Notification.permission : undefined,
          externalId: await OneSignal.User?.getExternalId?.().catch(() => null),
          subscriptionId: OneSignal.User?.PushSubscription?.id ?? null,
          subscriptionToken: OneSignal.User?.PushSubscription?.token ?? null,
          optedIn: OneSignal.User?.PushSubscription?.optedIn ?? null,
          platform: "web",
        });
      });
    });
  } catch (e) {
    err("status failed", e);
    return { supported: false, platform: currentPlatform() };
  }
}