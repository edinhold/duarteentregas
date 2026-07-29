import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPushState,
  initOneSignal,
  loginPushUser,
  logoutPushUser,
  requestPushPermission,
  setPushProfileType,
  subscribePushState,
  syncSubscription,
  type PushDeviceState,
} from "@/lib/push/onesignal";

/**
 * Binds OneSignal to the authenticated session:
 *  - initialises the SDK once the user is known;
 *  - associates external_id + profile type;
 *  - re-syncs the subscription when the app regains focus.
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
      await initOneSignal();
      await loginPushUser(user.id, profileType);
    })();
  }, [user, role]);

  // Keep the stored subscription fresh (permission revoked, new device id...).
  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      void syncSubscription(role ?? "customer");
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [user, role]);

  const enable = useCallback(async () => {
    const permission = await requestPushPermission();
    return permission;
  }, []);

  return { ...state, enable, resync: () => syncSubscription(role ?? "customer") };
}
