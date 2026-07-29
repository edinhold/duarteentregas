/**
 * Thin client for the push edge functions.
 *
 * A push failure must NEVER undo a delivery, so `notificarMotoristas` resolves
 * with a structured result instead of throwing on business-level outcomes.
 */
import { supabase } from "@/integrations/supabase/client";

export interface NotifyResult {
  ok: boolean;
  code: string;
  message: string;
  recipients?: number;
  eligible_drivers?: number;
  subscriptions?: number;
  notification_id?: string | null;
  http_status?: number;
  response?: unknown;
}

/** Outcomes that must not surface as an error to the store owner. */
const SILENT_CODES = new Set([
  "NO_ELIGIBLE_DRIVERS",
  "NO_SUBSCRIPTIONS",
  "JA_ENVIADO",
  "MISSING_CREDENTIALS",
]);

export function isSilentNotifyCode(code: string): boolean {
  return SILENT_CODES.has(code);
}

/** Fired by the backend right after a delivery request is committed. */
export async function notificarMotoristas(pedidoId: string): Promise<NotifyResult> {
  try {
    const { data, error } = await supabase.functions.invoke("notify-available-drivers", {
      body: { pedido_id: pedidoId },
    });
    if (error) {
      return { ok: false, code: "EDGE_ERROR", message: error.message };
    }
    return data as NotifyResult;
  } catch (err: any) {
    return { ok: false, code: "NETWORK_ERROR", message: String(err?.message ?? err) };
  }
}

/** Invalidates the offer on every other device after an accept/cancel. */
export async function invalidarNotificacao(pedidoId: string): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("cancel-delivery-notification", {
      body: { pedido_id: pedidoId },
    });
    if (error) console.log("[Push] Falha ao invalidar notificação", error.message);
  } catch (err) {
    console.log("[Push] Falha ao invalidar notificação", err);
  }
}
