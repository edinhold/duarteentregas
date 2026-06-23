import { Capacitor } from "@capacitor/core";

export const ONESIGNAL_APP_ID = "52d432a9-3b18-428f-ab87-eff19a2d5a6a";

/**
 * Initialize the OneSignal Cordova/Capacitor SDK.
 * Only runs on native platforms (Android / iOS). On the web build this is a no-op
 * because OneSignal's Cordova plugin requires native bridges.
 */
export async function initOneSignal(): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;

    // Dynamic import keeps the native-only plugin out of the web bundle.
    const mod = await import("onesignal-cordova-plugin");
    const OneSignal: any = (mod as any).default ?? mod;

    OneSignal.initialize(ONESIGNAL_APP_ID);

    // Ask the user for permission to receive push notifications (iOS / Android 13+).
    OneSignal.Notifications.requestPermission(true).catch((e: unknown) => {
      console.warn("[OneSignal] requestPermission failed", e);
    });

    // Log when a notification is clicked so we can wire navigation later.
    OneSignal.Notifications.addEventListener("click", (event: unknown) => {
      console.log("[OneSignal] notification clicked", event);
    });
  } catch (err) {
    console.error("[OneSignal] initialization failed", err);
  }
}

/** Associate the current authenticated user with their OneSignal subscription. */
export async function setOneSignalExternalUserId(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || !userId) return;
  try {
    const mod = await import("onesignal-cordova-plugin");
    const OneSignal: any = (mod as any).default ?? mod;
    OneSignal.login(userId);
  } catch (err) {
    console.error("[OneSignal] login failed", err);
  }
}

/** Clear the external user id (e.g. on logout). */
export async function clearOneSignalExternalUserId(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const mod = await import("onesignal-cordova-plugin");
    const OneSignal: any = (mod as any).default ?? mod;
    OneSignal.logout();
  } catch (err) {
    console.error("[OneSignal] logout failed", err);
  }
}
