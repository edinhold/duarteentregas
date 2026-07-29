/**
 * OneSignal Cordova plugin (v5) adapter — Android APK built with Median.co.
 *
 * Uses ONLY the v5 namespaced API (`initialize`, `Notifications`,
 * `User.pushSubscription`, `login`/`logout`). No legacy v3/v4 method is mixed
 * in. Initialisation always waits for `deviceready`.
 */
import { emitPushState, type PushPermission } from "./core";
import { getPushConfig } from "./config";

type Plugin = any;

let initPromise: Promise<Plugin | null> | null = null;
let listenersBound = false;

export function getCordovaPlugin(): Plugin | null {
  return (window as any)?.plugins?.OneSignal ?? null;
}

/** Resolves once Cordova fired `deviceready` (or immediately if already up). */
function deviceReady(timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    const w = window as any;
    if (w.__cordovaDeviceReady || getCordovaPlugin()) return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      w.__cordovaDeviceReady = true;
      resolve();
    };
    document.addEventListener("deviceready", finish, { once: true });
    setTimeout(finish, timeoutMs);
  });
}

function readPluginPermission(plugin: Plugin): PushPermission {
  try {
    const granted = plugin?.Notifications?.hasPermission?.();
    if (granted === true) return "granted";
    if (granted === false) return "default";
  } catch {
    /* ignore */
  }
  return "default";
}

async function readSubscriptionId(plugin: Plugin): Promise<string | null> {
  try {
    const sub = plugin?.User?.pushSubscription;
    if (!sub) return null;
    if (typeof sub.getIdAsync === "function") return (await sub.getIdAsync()) ?? null;
    if (typeof sub.getPushSubscriptionId === "function") {
      return sub.getPushSubscriptionId() ?? null;
    }
    return sub.id ?? null;
  } catch {
    return null;
  }
}

async function readOptedIn(plugin: Plugin): Promise<boolean> {
  try {
    const sub = plugin?.User?.pushSubscription;
    if (!sub) return false;
    if (typeof sub.getOptedInAsync === "function") return Boolean(await sub.getOptedInAsync());
    return Boolean(sub.optedIn);
  } catch {
    return false;
  }
}

export async function initCordova(
  onChange: () => void,
  onSyncEvent: (data: any, source: "foreground" | "click") => void,
): Promise<Plugin | null> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await deviceReady();
    const plugin = getCordovaPlugin();
    if (!plugin) {
      emitPushState({ error: "Plugin OneSignal não encontrado neste aplicativo." });
      initPromise = null;
      return null;
    }

    const config = await getPushConfig();
    if (!config?.appId) {
      emitPushState({ error: "Configuração de notificações indisponível no servidor." });
      initPromise = null;
      return null;
    }

    try {
      plugin.initialize(config.appId);
      console.log("[Push] Plugin Cordova inicializado");

      if (!listenersBound) {
        listenersBound = true;

        plugin.User?.pushSubscription?.addEventListener?.("change", (event: any) => {
          const id = event?.current?.id ?? event?.to?.id ?? null;
          const optedIn = Boolean(event?.current?.optedIn ?? event?.to?.optedIn);
          console.log("[Push] Inscrição alterada (APK)", {
            id: id ? `…${String(id).slice(-8)}` : null,
            optedIn,
          });
          emitPushState({ subscriptionId: id, optedIn });
          onChange();
        });

        plugin.Notifications?.addEventListener?.("permissionChange", (granted: boolean) => {
          emitPushState({ permission: granted ? "granted" : "denied" });
          onChange();
        });

        plugin.Notifications?.addEventListener?.("click", (event: any) => {
          const data =
            event?.notification?.additionalData ?? event?.result?.notification?.additionalData ?? {};
          onSyncEvent(data, "click");
        });

        plugin.Notifications?.addEventListener?.("foregroundWillDisplay", (event: any) => {
          const data = event?.notification?.additionalData ?? {};
          onSyncEvent(data, "foreground");
          // Keep the system notification: the in-app banner is additive.
          try {
            event?.preventDefault?.();
            event?.notification?.display?.();
          } catch {
            /* older builds simply display it */
          }
        });
      }

      const [id, optedIn] = await Promise.all([
        readSubscriptionId(plugin),
        readOptedIn(plugin),
      ]);

      emitPushState({
        initialized: true,
        appIdMasked: config.appIdMasked,
        subscriptionId: id,
        optedIn,
        permission: readPluginPermission(plugin),
        error: null,
      });

      return plugin;
    } catch (err: any) {
      console.log("[Push] Erro ao inicializar o plugin Cordova", err);
      emitPushState({ error: String(err?.message ?? err) });
      initPromise = null;
      return null;
    }
  })();

  return initPromise;
}

/** Android 13+ runtime permission request (fallbackToSettings = true). */
export async function requestCordovaPermission(): Promise<PushPermission> {
  const plugin = getCordovaPlugin();
  if (!plugin) return "unsupported";
  try {
    const accepted = await plugin.Notifications.requestPermission(true);
    return accepted ? "granted" : "denied";
  } catch (err) {
    console.log("[Push] Erro ao solicitar permissão (APK)", err);
    return "denied";
  }
}

export async function loginCordova(userId: string) {
  const plugin = getCordovaPlugin();
  if (!plugin) return;
  try {
    plugin.login(userId);
  } catch (err) {
    console.log("[Push] Falha no login (APK)", err);
  }
}

export async function logoutCordova() {
  const plugin = getCordovaPlugin();
  if (!plugin) return;
  try {
    plugin.logout();
  } catch (err) {
    console.log("[Push] Falha no logout (APK)", err);
  }
}

export async function readCordovaSubscription(): Promise<{ id: string | null; optedIn: boolean }> {
  const plugin = getCordovaPlugin();
  if (!plugin) return { id: null, optedIn: false };
  const [id, optedIn] = await Promise.all([readSubscriptionId(plugin), readOptedIn(plugin)]);
  return { id, optedIn };
}

export function readCordovaPermission(): PushPermission {
  const plugin = getCordovaPlugin();
  if (!plugin) return "unsupported";
  return readPluginPermission(plugin);
}

/** Opens the OS settings screen for the app (Android 13+ denial recovery). */
export function openAppSettings(): boolean {
  const plugin = getCordovaPlugin();
  try {
    if (plugin?.Notifications?.requestPermission) {
      // fallbackToSettings = true sends the user to the settings screen when
      // the permission was permanently denied.
      plugin.Notifications.requestPermission(true);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
