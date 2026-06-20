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
  const { delivery, state, accept, reject, permissionWarning, requestPermission } = useDeliveryOverlay({
    standby,
    timeoutMs,
    onAccepted: () => onAccepted?.(),
  });

  const handleRequestPermission = async () => {
    const result = await requestPermission();
    if (result === "denied") {
      try {
        const { toast } = await import("sonner");
        toast.warning(
          "Permissão bloqueada. Habilite notificações nas configurações do navegador/app para receber alertas com o app em segundo plano."
        );
      } catch {}
    }
  };

  return (
    <DeliveryOverlay
      delivery={delivery}
      state={state}
      permissionWarning={permissionWarning}
      onAccept={accept}
      onReject={reject}
      onRequestPermission={handleRequestPermission}
    />
  );
};

export default DeliveryNotifications;
