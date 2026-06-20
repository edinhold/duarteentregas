import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { playUrgentNotification } from "@/lib/notificationSound";

export type OverlayState = "loading" | "success" | "error" | "empty";

export interface OverlayDelivery {
  id: string;
  pickup_address: string;
  delivery_address: string;
  driver_fee: number | null;
  credit_cost: number | null;
  distance_km?: number | null;
  restaurant?: {
    name?: string | null;
    address?: string | null;
  } | null;
}

interface Options {
  /** Only show overlay when driver is in standby (no active delivery). */
  standby: boolean;
  /** Auto-dismiss timeout in ms. */
  timeoutMs?: number;
  /** Called after a successful accept so caller can navigate / refresh. */
  onAccepted?: (delivery: OverlayDelivery) => void;
}

/**
 * Listens for newly inserted pending delivery requests in realtime and
 * exposes the latest one for the overlay UI. Plays sound + vibration
 * while the overlay is active and supports an auto-dismiss timeout.
 */
export function useDeliveryOverlay({ standby, timeoutMs = 30000, onAccepted }: Options) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [delivery, setDelivery] = useState<OverlayDelivery | null>(null);
  const [state, setState] = useState<OverlayState>("empty");
  const [permissionWarning, setPermissionWarning] = useState(false);
  const checkPermission = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setPermissionWarning(true);
      return;
    }
    setPermissionWarning(Notification.permission !== "granted");
  }, []);
  const dismissedRef = useRef<Set<string>>(new Set());
  const soundTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const standbyRef = useRef(standby);
  standbyRef.current = standby;

  const stopAlerts = useCallback(() => {
    if (soundTimerRef.current) {
      clearInterval(soundTimerRef.current);
      soundTimerRef.current = null;
    }
    if (autoCloseRef.current) {
      clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    stopAlerts();
    setDelivery(null);
    setState("empty");
  }, [stopAlerts]);

  const startAlerts = useCallback(() => {
    try {
      playUrgentNotification();
      if ("vibrate" in navigator) navigator.vibrate?.([400, 200, 400, 200, 400]);
    } catch {}
    soundTimerRef.current = setInterval(() => {
      try {
        playUrgentNotification();
        if ("vibrate" in navigator) navigator.vibrate?.([400, 200, 400]);
      } catch {}
    }, 4000);
    autoCloseRef.current = setTimeout(() => {
      console.log("[DeliveryOverlay] Timeout — fechando overlay");
      close();
    }, timeoutMs);
  }, [close, timeoutMs]);

  const loadDelivery = useCallback(
    async (id: string) => {
      setState("loading");
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("id, pickup_address, delivery_address, driver_fee, credit_cost, status, driver_id, restaurants(name, address)")
        .eq("id", id)
        .maybeSingle();

      if (error || !data) {
        console.log("[DeliveryOverlay] Erro ao carregar entrega", error);
        setState("error");
        return;
      }
      if ((data as any).status !== "pending") {
        close();
        return;
      }
      if ((data as any).driver_id && (data as any).driver_id !== user?.id) {
        close();
        return;
      }
      const next: OverlayDelivery = {
        id: (data as any).id,
        pickup_address: (data as any).pickup_address,
        delivery_address: (data as any).delivery_address,
        driver_fee: (data as any).driver_fee,
        credit_cost: (data as any).credit_cost,
        restaurant: (data as any).restaurants,
      };
      setDelivery(next);
      setState("success");
    },
    [close, user?.id]
  );

  // Notification / overlay permission check (web fallback for Android SYSTEM_ALERT_WINDOW).
  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermissionWarning(true);
      return "denied" as NotificationPermission;
    }
    try {
      const result = await Notification.requestPermission();
      setPermissionWarning(result !== "granted");
      return result;
    } catch {
      setPermissionWarning(true);
      return "denied" as NotificationPermission;
    }
  }, []);

  // Realtime listener for new pending deliveries.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("delivery-overlay")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "delivery_requests" },
        (payload: any) => {
          const row = payload.new;
          if (!row || row.status !== "pending") return;
          if (row.driver_id && row.driver_id !== user.id) return;
          if (dismissedRef.current.has(row.id)) return;
          if (!standbyRef.current) return; // only when driver is standby/online
          if (delivery) return; // prevent multiple overlays

          console.log("[DeliveryOverlay] Nova entrega recebida", row.id);
          startAlerts();
          loadDelivery(row.id);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "delivery_requests" },
        (payload: any) => {
          // If the currently-shown delivery was taken or cancelled, dismiss.
          const row = payload.new;
          if (!row || !delivery) return;
          if (row.id !== delivery.id) return;
          if (row.status !== "pending" || (row.driver_id && row.driver_id !== user.id)) {
            close();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, delivery, startAlerts, loadDelivery, close]);

  // Cleanup on unmount.
  useEffect(() => () => stopAlerts(), [stopAlerts]);

  const accept = useCallback(async () => {
    if (!delivery || !user) return;
    try {
      const { error } = await supabase
        .from("delivery_requests")
        .update({ driver_id: user.id, status: "accepted" } as any)
        .eq("id", delivery.id)
        .eq("status", "pending");
      if (error) throw error;
      console.log("[DeliveryOverlay] Entrega aceita", delivery.id);
      queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
      queryClient.invalidateQueries({ queryKey: ["driver-my-requests"] });
      onAccepted?.(delivery);
      close();
    } catch (err) {
      console.log("[DeliveryOverlay] Falha ao aceitar", err);
      setState("error");
    }
  }, [delivery, user, queryClient, onAccepted, close]);

  const reject = useCallback(() => {
    if (!delivery) return;
    console.log("[DeliveryOverlay] Entrega recusada", delivery.id);
    dismissedRef.current.add(delivery.id);
    close();
  }, [delivery, close]);

  return { delivery, state, accept, reject, close, permissionWarning };
}
