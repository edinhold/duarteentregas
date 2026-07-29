/**
 * Unified push facade — the ONLY module the app imports.
 *
 * It picks the Cordova plugin inside the Median APK and the Web SDK in the
 * PWA/browser, and mirrors every device into `public.push_subscriptions`.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  deviceModel,
  detectPlatform,
  detectRuntime,
  emitPushState,
  getPushState,
  isStandalone,
  readBrowserPermission,
  subscribePushState,
  type PushDeviceState,
  type PushPermission,
} from "./core";
import { getPushConfig } from "./config";
import {
  initCordova,
  loginCordova,
  logoutCordova,
  openAppSettings,
  readCordovaPermission,
  readCordovaSubscription,
  requestCordovaPermission,
} from "./cordova";
import {
  initWeb,
  loginWeb,
  logoutWeb,
  readWebSubscription,
  requestWebPermission,
} from "./web";

export { getPushState, subscribePushState, openAppSettings };
export type { PushDeviceState, PushPermission };

let currentProfileType = "customer";

export function setPushProfileType(profileType: string) {
  currentProfileType = profileType;
}

/**
 * Notification payloads arriving while the app runs (foreground) or on tap.
 * The UI listens to `push-event` and re-reads the database — the notification
 * body is a hint, never the source of truth.
 */
function dispatchPushEvent(data: any, source: "foreground" | "click") {
  const tipo = data?.tipo ?? "desconhecido";
  console.log("[Push] Evento recebido", { tipo, source, pedido_id: data?.pedido_id });
  window.dispatchEvent(new CustomEvent("push-event", { detail: { data, source } }));

  if (source === "click" && data?.pedido_id) {
    const rota = typeof data?.rota === "string" && data.rota.startsWith("/")
      ? data.rota
      : `/entregador?entrega=${data.pedido_id}`;
    // Full navigation keeps the session restore path identical to a cold open.
    if (window.location.pathname + window.location.search !== rota) {
      window.location.assign(window.location.origin + rota);
    }
  }
}

/** Initialises the correct SDK for the current runtime. Safe to call twice. */
export async function initPush(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const runtime = detectRuntime();
  emitPushState({ runtime, platform: detectPlatform() });

  const onChange = () => {
    void syncSubscription();
  };

  const sdk =
    runtime === "cordova"
      ? await initCordova(onChange, dispatchPushEvent)
      : await initWeb(onChange, dispatchPushEvent);

  return Boolean(sdk);
}

/** Associates the device with the Supabase user id (external_id). */
export async function loginPushUser(userId: string, profileType: string) {
  setPushProfileType(profileType);
  const ok = await initPush();
  if (!ok) return;
  if (detectRuntime() === "cordova") await loginCordova(userId);
  else await loginWeb(userId);
  emitPushState({ externalId: userId });
  console.log("[Push] External ID associado ao usuário autenticado");
  await syncSubscription();
}

export async function logoutPushUser() {
  try {
    if (detectRuntime() === "cordova") await logoutCordova();
    else await logoutWeb();
  } finally {
    emitPushState({ externalId: null, syncedToDatabase: false });
  }
}

/** User-triggered permission prompt (never called silently). */
export async function requestPushPermission(): Promise<PushPermission> {
  await initPush();
  const permission =
    detectRuntime() === "cordova"
      ? await requestCordovaPermission()
      : await requestWebPermission();
  emitPushState({ permission });
  // The subscription id only materialises after the prompt is accepted.
  await new Promise((r) => setTimeout(r, 800));
  await syncSubscription();
  return permission;
}

async function readDevice(): Promise<{ id: string | null; optedIn: boolean; permission: PushPermission }> {
  if (detectRuntime() === "cordova") {
    const { id, optedIn } = await readCordovaSubscription();
    return { id, optedIn, permission: readCordovaPermission() };
  }
  const { id, optedIn } = readWebSubscription();
  return { id, optedIn, permission: readBrowserPermission() };
}

/**
 * Upserts this device into `public.push_subscriptions`.
 * One row per installation — a driver using both the PWA and the APK keeps
 * two independent rows.
 */
export async function syncSubscription(profileTypeHint?: string): Promise<boolean> {
  try {
    const { id: subscriptionId, optedIn, permission } = await readDevice();
    if (!subscriptionId) {
      emitPushState({ permission, optedIn, syncedToDatabase: false });
      return false;
    }

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return false;

    const active = optedIn && permission === "granted";
    const row = {
      user_id: userId,
      profile_type: profileTypeHint ?? currentProfileType,
      platform: detectPlatform(),
      device_type: detectRuntime() === "cordova"
        ? "android_app"
        : isStandalone()
        ? "pwa_standalone"
        : "browser",
      onesignal_subscription_id: subscriptionId,
      onesignal_external_id: userId,
      permission_status: permission,
      subscription_status: active ? "subscribed" : "unsubscribed",
      active,
      app_version: import.meta.env.MODE,
      device_model: deviceModel(),
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(row, { onConflict: "onesignal_subscription_id" });

    if (error) {
      console.log("[Push] Falha ao salvar inscrição", error.message);
      emitPushState({ error: error.message, syncedToDatabase: false });
      return false;
    }

    emitPushState({
      subscriptionId,
      optedIn,
      permission,
      externalId: userId,
      lastSyncedAt: row.last_seen_at,
      syncedToDatabase: true,
      error: null,
    });
    console.log("[Push] Inscrição sincronizada", `…${subscriptionId.slice(-8)}`);
    return true;
  } catch (err) {
    console.log("[Push] Erro na sincronização", err);
    return false;
  }
}

/** Loads the masked App ID for the status/diagnostics UI. */
export async function refreshPushConfigState() {
  const config = await getPushConfig();
  if (config) emitPushState({ appIdMasked: config.appIdMasked });
  return config;
}
