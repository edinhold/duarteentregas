import DeliveryOverlay from "./DeliveryOverlay";
import { useDeliveryOverlay } from "@/hooks/useDeliveryOverlay";

interface Props {
  /** True when the driver is in standby (online + no active delivery). */
  standby: boolean;
  /** Callback invoked after the driver accepts; used to navigate to details. */
  onAccepted?: () => void;
  timeoutMs?: number;
}

/**
 * Mountable wrapper that shows the standby delivery overlay above the
 * entire app whenever a new pending delivery arrives.
 */
const DeliveryNotifications = ({ standby, onAccepted, timeoutMs }: Props) => {
  const { delivery, state, accept, reject, permissionWarning } = useDeliveryOverlay({
    standby,
    timeoutMs,
    onAccepted: () => onAccepted?.(),
  });

  const requestPermission = () => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  };

  return (
    <DeliveryOverlay
      delivery={delivery}
      state={state}
      permissionWarning={permissionWarning}
      onAccept={accept}
      onReject={reject}
      onRequestPermission={requestPermission}
    />
  );
};

export default DeliveryNotifications;
