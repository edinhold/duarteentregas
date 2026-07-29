/**
 * OneSignal Web SDK (v16) adapter — PWA / desktop browser.
 *
 * Loads the SDK once, registers a dedicated service worker under /onesignal/
 * (never mixed with the Workbox worker) and keeps the device state in sync.
 */
import {
  emitPushState,
  readBrowserPermission,
  type PushPermission,
} from "./core";
import { getPushConfig } from "./config";

const SDK_URL = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";

type OneSignalApi = any;

let initPromise: Promise<OneSignalApi | null> | null = null;
let listenersBound = false;

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

function deferred(): Promise<OneSignalApi> {
  return new Promise((resolve) => {
    const w = window as any;
    w.OneSignalDeferred = w.OneSignalDeferred || [];
    w.OneSignalDeferred.push((OneSignal: OneSignalApi) => resolve(OneSignal));
  });
}

export function getWebSdk(): OneSignalApi | null {
  return (window as any).OneSignal ?? null;
}

export async function initWeb(
  onChange: () => void,
  onSyncEvent: (data: any, source: "foreground" | "click") => void,
): Promise<OneSignalApi | null> {
  if (typeof window === "undefined") return null;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const config = await getPushConfig();
    if (!config?.appId) {
      emitPushState({
        error: config
          ? `Credenciais do OneSignal ausentes no servidor (${config.missingSecrets.join(", ")}).`
          : "Não foi possível carregar a configuração de notificações.",
      });
      initPromise = null;
      return null;
    }

    try {
      await loadSdk();
      const OneSignal = await deferred();
      await OneSignal.init({
        appId: config.appId,
        // Dedicated path + scope: keeps the OneSignal worker isolated from the
        // Workbox PWA worker registered at "/".
        serviceWorkerPath: "onesignal/OneSignalSDKWorker.js",
        serviceWorkerParam: { scope: "/onesignal/" },
        allowLocalhostAsSecureOrigin: true,
        autoResubscribe: true,
        notifyButton: { enable: false },
      });

      console.log("[Push] Web SDK inicializado");
      emitPushState({
        initialized: true,
        appIdMasked: config.appIdMasked,
        permission: readBrowserPermission(),
        optedIn: Boolean(OneSignal.User?.PushSubscription?.optedIn),
        subscriptionId: OneSignal.User?.PushSubscription?.id ?? null,
        error: null,
      });

      if (!listenersBound) {
        listenersBound = true;

        OneSignal.User?.PushSubscription?.addEventListener?.("change", (event: any) => {
          const id = event?.current?.id ?? OneSignal.User?.PushSubscription?.id ?? null;
          const optedIn = Boolean(
            event?.current?.optedIn ?? OneSignal.User?.PushSubscription?.optedIn,
          );
          console.log("[Push] Inscrição alterada", {
            id: id ? `…${String(id).slice(-8)}` : null,
            optedIn,
          });
          emitPushState({ subscriptionId: id, optedIn, permission: readBrowserPermission() });
          onChange();
        });

        OneSignal.Notifications?.addEventListener?.("permissionChange", () => {
          emitPushState({ permission: readBrowserPermission() });
          onChange();
        });

        // App in foreground: the in-app banner + Realtime own the UI.
        OneSignal.Notifications?.addEventListener?.(
          "foregroundWillDisplay",
          (event: any) => {
            const data = event?.notification?.additionalData ?? {};
            onSyncEvent(data, "foreground");
          },
        );

        OneSignal.Notifications?.addEventListener?.("click", (event: any) => {
          const data = event?.notification?.additionalData ?? {};
          onSyncEvent(data, "click");
        });
      }

      return OneSignal;
    } catch (err: any) {
      console.log("[Push] Erro ao inicializar o Web SDK", err);
      emitPushState({ error: String(err?.message ?? err) });
      initPromise = null;
      return null;
    }
  })();

  return initPromise;
}

export async function requestWebPermission(): Promise<PushPermission> {
  const OneSignal = getWebSdk();
  if (!OneSignal) return "unsupported";
  try {
    await OneSignal.Notifications.requestPermission();
    // Opting in matters when the user previously unsubscribed but kept the
    // browser permission granted.
    if (OneSignal.User?.PushSubscription?.optIn) {
      await OneSignal.User.PushSubscription.optIn();
    }
  } catch (err) {
    console.log("[Push] Erro ao solicitar permissão (web)", err);
  }
  return readBrowserPermission();
}

export async function loginWeb(userId: string) {
  const OneSignal = getWebSdk();
  if (!OneSignal) return;
  try {
    if (OneSignal.User?.externalId !== userId) await OneSignal.login(userId);
  } catch (err) {
    console.log("[Push] Falha no login (web)", err);
  }
}

export async function logoutWeb() {
  const OneSignal = getWebSdk();
  if (!OneSignal?.logout) return;
  try {
    await OneSignal.logout();
  } catch (err) {
    console.log("[Push] Falha no logout (web)", err);
  }
}

export function readWebSubscription(): { id: string | null; optedIn: boolean } {
  const OneSignal = getWebSdk();
  return {
    id: OneSignal?.User?.PushSubscription?.id ?? null,
    optedIn: Boolean(OneSignal?.User?.PushSubscription?.optedIn),
  };
}
