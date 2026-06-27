import { Capacitor } from "@capacitor/core";

export const ONESIGNAL_APP_ID = "52d432a9-3b18-428f-ab87-eff19a2d5a6a";

declare global {
  interface Window {
    OneSignal?: any;
    OneSignalDeferred?: any[];
  }
}

let webInitStarted = false;
let nativeInitPromise: Promise<any> | null = null;
let webInitPromise: Promise<void> | null = null;

async function initOneSignalNative(): Promise<any> {
  if (nativeInitPromise) return nativeInitPromise;

  nativeInitPromise = (async () => {
    const mod = await import("onesignal-cordova-plugin");
    const OneSignal: any = (mod as any).default ?? mod;

    try {
      OneSignal.Debug?.setLogLevel?.(5);
    } catch {}

    OneSignal.initialize(ONESIGNAL_APP_ID);

    try {
      OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event: any) => {
        const notification = event?.getNotification?.();
        try {
          notification?.display?.();
        } catch {}
        try {
          if ("vibrate" in navigator) navigator.vibrate?.([400, 200, 400]);
        } catch {}
      });
    } catch (err) {
      console.warn("[PushNotifications] foreground listener failed", err);
    }

    try {
      OneSignal.Notifications.addEventListener("click", (event: any) => {
        console.log("[PushNotifications] native click", event);
        const url = event?.notification?.additionalData?.url || event?.notification?.additionalData?.rota || "/entregador";
        if (typeof window !== "undefined") window.location.assign(url === "/motorista/pedido" ? "/entregador" : url);
      });
    } catch {}

    try {
      OneSignal.User?.pushSubscription?.optIn?.();
    } catch {}

    console.log("[PushNotifications] OneSignal Native initialized");
    return OneSignal;
  })();

  return nativeInitPromise;
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

async function initOneSignalWeb(): Promise<void> {
  if (webInitPromise) return webInitPromise;
  if (typeof window === "undefined") return;
  if (isPreviewOrIframe()) {
    console.log("[PushNotifications] skipping OneSignal Web init in preview/iframe");
    return;
  }
  webInitStarted = true;

  webInitPromise = new Promise<void>((resolve) => {

  // Inject SDK script once
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
      OneSignal.Notifications.addEventListener("click", (event: any) => {
        console.log("[PushNotifications] web click", event);
        try {
          const url = event?.notification?.additionalData?.url || event?.notification?.additionalData?.rota || "/entregador";
          window.location.assign(url === "/motorista/pedido" ? "/entregador" : url);
        } catch {}
      });
      console.log("[PushNotifications] OneSignal Web initialized");
      resolve();
    } catch (err) {
      console.error("[PushNotifications] OneSignal Web init failed", err);
      resolve();
    }
  });

  });

  return webInitPromise;
}

/**
 * Initialize the OneSignal SDK on both native (Capacitor) and web.
 */
export async function initOneSignal(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      const OneSignal = await initOneSignalNative();
      OneSignal.Notifications.requestPermission(true).catch((e: unknown) => {
        console.warn("[PushNotifications] requestPermission failed", e);
      });
      return;
    }
    await initOneSignalWeb();
  } catch (err) {
    console.error("[PushNotifications] initialization failed", err);
  }
}

/** Request browser/system permission for push notifications (call from a user gesture). */
export async function requestOneSignalPermission(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const OneSignal = await initOneSignalNative();
      const granted = await OneSignal.Notifications.requestPermission(true);
      if (granted) OneSignal.User?.pushSubscription?.optIn?.();
      return !!granted;
    }
    if (typeof window === "undefined" || isPreviewOrIframe()) return false;
    await initOneSignalWeb();
    return await new Promise<boolean>((resolve) => {
      window.OneSignalDeferred!.push(async (OneSignal: any) => {
        try {
          const granted = await OneSignal.Notifications.requestPermission(true);
          resolve(!!granted);
        } catch (e) {
          console.error("[PushNotifications] web requestPermission failed", e);
          resolve(false);
        }
      });
    });
  } catch (err) {
    console.error("[PushNotifications] requestPermission error", err);
    return false;
  }
}

/** Associate the current authenticated user with their OneSignal subscription. */
export async function setOneSignalExternalUserId(userId: string): Promise<void> {
  if (!userId) return;
  try {
    if (Capacitor.isNativePlatform()) {
      const OneSignal = await initOneSignalNative();
      try { OneSignal.User?.pushSubscription?.optIn?.(); } catch {}
      OneSignal.login(userId);
      console.log("[PushNotifications] native login", userId);
      return;
    }
    if (typeof window === "undefined" || isPreviewOrIframe()) return;
    await initOneSignalWeb();
    window.OneSignalDeferred!.push((OneSignal: any) => {
      try {
        OneSignal.login(userId);
        console.log("[PushNotifications] web login", userId);
      } catch (e) {
        console.error("[PushNotifications] web login failed", e);
      }
    });
  } catch (err) {
    console.error("[PushNotifications] login failed", err);
  }
}

/** Clear the external user id (e.g. on logout). */
export async function clearOneSignalExternalUserId(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      const OneSignal = await initOneSignalNative();
      OneSignal.logout();
      return;
    }
    if (typeof window === "undefined" || isPreviewOrIframe()) return;
    if (!window.OneSignalDeferred) return;
    window.OneSignalDeferred.push((OneSignal: any) => {
      try { OneSignal.logout(); } catch (e) { console.error("[PushNotifications] web logout failed", e); }
    });
  } catch (err) {
    console.error("[PushNotifications] logout failed", err);
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
  } catch (err) {
    console.error("[PushNotifications] status failed", err);
    return { supported: false };
  }
}
