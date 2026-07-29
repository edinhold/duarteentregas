import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPushState,
  initPush,
  loginPushUser,
  logoutPushUser,
  refreshPushConfigState,
  requestPushPermission,
  setPushProfileType,
  subscribePushState,
  syncSubscription,
  type PushDeviceState,
} from "@/lib/push";

/**
 * Binds OneSignal to the authenticated session:
 *  - initialises the correct SDK (Cordova APK vs Web PWA);
 *  - associates external_id = auth.user.id;
 *  - re-syncs the stored subscription when the app regains focus.
 *
 * It never prompts for permission by itself — that is always user-triggered.
 */
export function usePushNotifications() {
  const { user, role } = useAuth();
  const [state, setState] = useState<PushDeviceState>(getPushState());

  useEffect(() => subscribePushState(setState), []);

  useEffect(() => {
    if (!user) {
      void logoutPushUser();
      return;
    }
    const profileType = role ?? "customer";
    setPushProfileType(profileType);
    void (async () => {
      await refreshPushConfigState();
      await initPush();
      await loginPushUser(user.id, profileType);
    })();
  }, [user, role]);

  // Keep the stored subscription fresh (permission revoked, new device id…).
  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      void syncSubscription(role ?? "customer");
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    document.addEventListener("resume", onFocus); // Cordova
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      document.removeEventListener("resume", onFocus);
    };
  }, [user, role]);

  const enable = useCallback(async () => await requestPushPermission(), []);
  const resync = useCallback(
    async () => await syncSubscription(role ?? "customer"),
    [role],
  );

  return { ...state, enable, resync };
}
