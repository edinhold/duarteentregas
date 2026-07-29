/**
 * OneSignal Web SDK (v16) integration — PWA / browser.
 *
 * Responsibilities:
 *  - load and initialise the SDK exactly once;
 *  - associate the authenticated Supabase user via external_id;
 *  - request notification permission on demand (never silently);
 *  - keep `public.push_subscriptions` in sync with the real device state.
 *
 * The private App API Key never touches this file — only the public App ID.
 */
import { supabase } from "@/integrations/supabase/client";

export const ONESIGNAL_APP_ID = "52d432a9-3b18-428f-ab87-eff19a2d5a6a";
const SDK_URL = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";

export type PushPlatform = "web_pwa" | "android_apk" | "ios";

export interface PushDeviceState {
  supported: boolean;
  initialized: boolean;
  permission: "granted" | "denied" | "default" | "unsupported";
  optedIn: boolean;
  subscriptionId: string | null;
  externalId: string | null;
  platform: PushPlatform;
  lastSyncedAt: string | null;
  error?: string;
}

type OneSignalApi = any;

let initPromise: Promise<OneSignalApi | null> | null = null;
let listenersBound = false;
const stateListeners = new Set<(s: PushDeviceState) => void>();
let currentState: PushDeviceState = {
  supported: typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator,
  initialized: false,
  permission: "default",
  optedIn: false,
  subscriptionId: null,
  externalId: null,
  platform: detectPlatform(),
  lastSyncedAt: null,
};

export function detectPlatform(): PushPlatform {
  if (typeof window === "undefined") return "web_pwa";
  const w = window as any;
  const cordovaPlugin = w?.plugins?.OneSignal || w?.cordova;
  if (cordovaPlugin && /android/i.test(navigator.userAgent)) return "android_apk";
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return "ios";
  return "web_pwa";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    (navigator as any).standalone === true
  );
}

function deviceModel(): string {
  if (typeof navigator === "undefined") return "unknown";
  return `${navigator.userAgent.slice(0, 180)}${isStandalone() ? " [standalone]" : ""}`;
}

function readPermission(): PushDeviceState["permission"] {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as PushDeviceState["permission"];
}

function emit(patch: Partial<PushDeviceState>) {
  currentState = { ...currentState, ...patch };
  stateListeners.forEach((fn) => {
    try {
      fn(currentState);
    } catch {
      /* listener errors must never break the SDK flow */
    }
  });
}

export function getPushState(): PushDeviceState {
  return currentState;
}

export function subscribePushState(fn: (s: PushDeviceState) => void): () => void {
  stateListeners.add(fn);
  fn(currentState);
  return () => stateListeners.delete(fn);
}

function loadSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${SDK_URL}"]`)) return resolve();
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar o SDK do OneSignal"));
    document.head.appendChild(script);
  });
}

function withOneSignal(): Promise<OneSignalApi> {
  return new Promise((resolve) => {
    const w = window as any;
    w.OneSignalDeferred = w.OneSignalDeferred || [];
    w.OneSignalDeferred.push((OneSignal: OneSignalApi) => resolve(OneSignal));
  });
}

/** Initialises the Web SDK once per page load. Safe to call repeatedly. */
export async function initOneSignal(): Promise<OneSignalApi | null> {
  if (typeof window === "undefined") return null;
  if (!currentState.supported) {
    emit({ permission: "unsupported" });
    return null;
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await loadSdk();
      const OneSignal = await withOneSignal();
      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        // Dedicated scope keeps the OneSignal worker away from the PWA worker.
        serviceWorkerPath: "onesignal/OneSignalSDKWorker.js",
        serviceWorkerParam: { scope: "/onesignal/" },
        allowLocalhostAsSecureOrigin: true,
        autoResubscribe: true,
        notifyButton: { enable: false },
      });
      console.log("[Push] OneSignal inicializado");
      emit({
        initialized: true,
        permission: readPermission(),
        optedIn: Boolean(OneSignal.User?.PushSubscription?.optedIn),
        subscriptionId: OneSignal.User?.PushSubscription?.id ?? null,
      });
      bindListeners(OneSignal);
      return OneSignal;
    } catch (err: any) {
      console.log("[Push] Erro ao inicializar OneSignal", err);
      emit({ error: String(err?.message ?? err) });
      initPromise = null;
      return null;
    }
  })();

  return initPromise;
}

function bindListeners(OneSignal: OneSignalApi) {
  if (listenersBound) return;
  listenersBound = true;

  OneSignal.User?.PushSubscription?.addEventListener?.("change", (event: any) => {
    const id = event?.current?.id ?? OneSignal.User?.PushSubscription?.id ?? null;
    const optedIn = Boolean(event?.current?.optedIn ?? OneSignal.User?.PushSubscription?.optedIn);
    console.log("[Push] Inscrição alterada", { id: id ? `…${String(id).slice(-8)}` : null, optedIn });
    emit({ subscriptionId: id, optedIn, permission: readPermission() });
    void syncSubscription();
  });

  OneSignal.Notifications?.addEventListener?.("permissionChange", (granted: boolean) => {
    console.log("[Push] Permissão alterada", granted);
    emit({ permission: readPermission() });
    void syncSubscription();
  });

  // App in foreground: let the in-app overlay/realtime handle the UI.
  OneSignal.Notifications?.addEventListener?.("foregroundWillDisplay", (event: any) => {
    const data = event?.notification?.additionalData ?? {};
    console.log("[Push] Notificação em primeiro plano", data?.tipo, data?.pedido_id);
    window.dispatchEvent(new CustomEvent("push-foreground", { detail: data }));
  });

  OneSignal.Notifications?.addEventListener?.("click", (event: any) => {
    const data = event?.notification?.additionalData ?? {};
    console.log("[Push] Clique na notificação", data?.tipo, data?.pedido_id);
    if (data?.pedido_id) {
      const url = new URL(window.location.origin + "/entregador");
      url.searchParams.set("entrega", String(data.pedido_id));
      window.location.assign(url.toString());
    }
  });
}

/** Associates the OneSignal device with the Supabase user id. */
export async function loginPushUser(userId: string, profileType: string) {
  const OneSignal = await initOneSignal();
  if (!OneSignal) return;
  try {
    if (OneSignal.User?.externalId !== userId) {
      await OneSignal.login(userId);
    }
    emit({ externalId: userId });
    console.log("[Push] External ID associado", userId);
    await syncSubscription(profileType);
  } catch (err) {
    console.log("[Push] Falha ao associar external id", err);
  }
}

export async function logoutPushUser() {
  try {
    const w = window as any;
    if (w.OneSignal?.logout) {
      await w.OneSignal.logout();
      console.log("[Push] Logout do OneSignal executado");
    }
  } catch (err) {
    console.log("[Push] Falha no logout do OneSignal", err);
  }
  emit({ externalId: null });
}

/** Explicit, user-triggered permission prompt. */
export async function requestPushPermission(): Promise<PushDeviceState["permission"]> {
  const OneSignal = await initOneSignal();
  if (!OneSignal) return "unsupported";
  try {
    await OneSignal.Notifications.requestPermission();
  } catch (err) {
    console.log("[Push] Erro ao solicitar permissão", err);
  }
  const permission = readPermission();
  emit({ permission, subscriptionId: OneSignal.User?.PushSubscription?.id ?? null });
  await syncSubscription();
  return permission;
}

/** Upserts the current device into public.push_subscriptions. */
export async function syncSubscription(profileTypeHint?: string): Promise<boolean> {
  try {
    const w = window as any;
    const OneSignal = w.OneSignal;
    const subscriptionId: string | null = OneSignal?.User?.PushSubscription?.id ?? null;
    if (!subscriptionId) {
      console.log("[Push] Sem subscription id para sincronizar");
      return false;
    }
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return false;

    const permission = readPermission();
    const optedIn = Boolean(OneSignal?.User?.PushSubscription?.optedIn);
    const profileType = profileTypeHint ?? currentProfileType ?? "customer";

    const row = {
      user_id: userId,
      profile_type: profileType,
      platform: detectPlatform(),
      device_type: isStandalone() ? "pwa_standalone" : "browser",
      onesignal_subscription_id: subscriptionId,
      onesignal_external_id: userId,
      permission_status: permission,
      subscription_status: optedIn && permission === "granted" ? "subscribed" : "unsubscribed",
      active: optedIn && permission === "granted",
      app_version: import.meta.env.MODE,
      device_model: deviceModel(),
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(row as any, { onConflict: "onesignal_subscription_id" });

    if (error) {
      console.log("[Push] Falha ao salvar inscrição", error.message);
      return false;
    }
    emit({
      subscriptionId,
      optedIn,
      permission,
      externalId: userId,
      lastSyncedAt: row.last_seen_at,
    });
    console.log("[Push] Inscrição sincronizada", `…${subscriptionId.slice(-8)}`);
    return true;
  } catch (err) {
    console.log("[Push] Erro na sincronização da inscrição", err);
    return false;
  }
}

let currentProfileType: string | null = null;
export function setPushProfileType(profileType: string) {
  currentProfileType = profileType;
}
