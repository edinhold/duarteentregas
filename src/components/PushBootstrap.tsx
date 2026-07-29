import { usePushNotifications } from "@/hooks/usePushNotifications";

/**
 * Headless bootstrap: initialises OneSignal and keeps the device subscription
 * in sync for every authenticated profile (driver, store owner, admin).
 * Never prompts for permission by itself — that is always user-triggered.
 */
const PushBootstrap = () => {
  usePushNotifications();
  return null;
};

export default PushBootstrap;
