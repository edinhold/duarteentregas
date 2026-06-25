import { Capacitor } from "@capacitor/core";

export const ONESIGNAL_APP_ID = "52d432a9-3b18-428f-ab87-eff19a2d5a6a";

declare global {
  interface Window {
    OneSignal?: any;
    OneSignalDeferred?: any[];
  }
}

let webInitStarted = false;

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
  if (webInitStarted) return;
  if (typeof window === "undefined") return;
  if (isPreviewOrIframe()) {
    console.log("[PushNotifications] skipping OneSignal Web init in preview/iframe");
    return;
  }
  webInitStarted = true;

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
          const url = event?.notification?.additionalData?.url || "/motorista";
          window.location.assign(url);
        } catch {}
      });
      console.log("[PushNotifications] OneSignal Web initialized");
    } catch (err) {
      console.error("[PushNotifications] OneSignal Web init failed", err);
    }
  });
}

/**
 * Initialize the OneSignal SDK on both native (Capacitor) and web.
 */
export async function initOneSignal(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      const mod = await import("onesignal-cordova-plugin");
      const OneSignal: any = (mod as any).default ?? mod;
      OneSignal.initialize(ONESIGNAL_APP_ID);
      OneSignal.Notifications.requestPermission(true).catch((e: unknown) => {
        console.warn("[PushNotifications] requestPermission failed", e);
      });
      OneSignal.Notifications.addEventListener("click", (event: unknown) => {
        console.log("[PushNotifications] native click", event);
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
      const mod = await import("onesignal-cordova-plugin");
      const OneSignal: any = (mod as any).default ?? mod;
      return await OneSignal.Notifications.requestPermission(true);
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
      const mod = await import("onesignal-cordova-plugin");
      const OneSignal: any = (mod as any).default ?? mod;
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
      const mod = await import("onesignal-cordova-plugin");
      const OneSignal: any = (mod as any).default ?? mod;
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
