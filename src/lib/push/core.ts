/**
 * Shared push types + the tiny observable store used by the UI.
 *
 * NOTHING secret lives here: only the public OneSignal App ID (fetched from
 * the backend) and device-level state.
 */

export type PushPlatform = "android_apk" | "web_pwa" | "ios";
export type PushPermission = "granted" | "denied" | "default" | "unsupported";

export interface PushDeviceState {
  /** The runtime can technically receive push. */
  supported: boolean;
  /** SDK finished initialising. */
  initialized: boolean;
  permission: PushPermission;
  optedIn: boolean;
  subscriptionId: string | null;
  externalId: string | null;
  platform: PushPlatform;
  /** "cordova" (APK) or "web" (PWA / browser). */
  runtime: "cordova" | "web";
  appIdMasked: string | null;
  lastSyncedAt: string | null;
  syncedToDatabase: boolean;
  error: string | null;
}

export const ANDROID_CHANNEL_ID = "novas_entregas_v1";

/** Detects the Median/Cordova bridge; falls back to the browser runtime. */
export function detectRuntime(): "cordova" | "web" {
  if (typeof window === "undefined") return "web";
  const w = window as any;
  return w?.plugins?.OneSignal || w?.cordova ? "cordova" : "web";
}

export function detectPlatform(): PushPlatform {
  if (typeof window === "undefined") return "web_pwa";
  const ua = navigator.userAgent;
  if (detectRuntime() === "cordova" && /android/i.test(ua)) return "android_apk";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "web_pwa";
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    (navigator as any).standalone === true
  );
}

export function deviceModel(): string {
  if (typeof navigator === "undefined") return "unknown";
  return `${navigator.userAgent.slice(0, 180)}${isStandalone() ? " [standalone]" : ""}`;
}

export function readBrowserPermission(): PushPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as PushPermission;
}

// ---------------------------------------------------------------------------
// Observable state
// ---------------------------------------------------------------------------

const listeners = new Set<(s: PushDeviceState) => void>();

let state: PushDeviceState = {
  supported:
    typeof window !== "undefined" &&
    (detectRuntime() === "cordova" ||
      ("Notification" in window && "serviceWorker" in navigator)),
  initialized: false,
  permission: "default",
  optedIn: false,
  subscriptionId: null,
  externalId: null,
  platform: detectPlatform(),
  runtime: detectRuntime(),
  appIdMasked: null,
  lastSyncedAt: null,
  syncedToDatabase: false,
  error: null,
};

export function getPushState(): PushDeviceState {
  return state;
}

export function emitPushState(patch: Partial<PushDeviceState>): void {
  state = { ...state, ...patch };
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch {
      /* a broken listener must never break the SDK flow */
    }
  });
}

export function subscribePushState(fn: (s: PushDeviceState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => {
    listeners.delete(fn);
  };
}
