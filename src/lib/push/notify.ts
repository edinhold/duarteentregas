import { supabase } from "@/integrations/supabase/client";

export interface PushInvokeResult {
  success: boolean;
  code?: string;
  message?: string;
  request_id?: string;
  recipients?: number;
  notification_id?: string | null;
  [key: string]: unknown;
}

const FUNCTION_NAME = "notify-available-drivers";

/**
 * Calls the push Edge Function with a validated session and surfaces the real
 * backend error message instead of the generic
 * "Failed to send a request to the Edge Function".
 */
export async function chamarNotificacao(
  body: Record<string, unknown>,
): Promise<PushInvokeResult> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(`Falha ao verificar sessão: ${sessionError.message}`);
  }
  if (!sessionData.session) {
    throw new Error("Sua sessão expirou. Entre novamente no sistema.");
  }

  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body,
    headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
  });

  if (error) {
    console.error("[push] erro ao chamar Edge Function", {
      name: (error as any)?.name,
      message: error.message,
    });

    const ctx = (error as any)?.context;
    if (ctx instanceof Response) {
      try {
        const details = await ctx.clone().json();
        throw new Error(
          `${details?.message ?? `Falha HTTP ${ctx.status}`}${
            details?.request_id ? ` (id: ${details.request_id})` : ""
          }`,
        );
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message) throw parseError;
      }
      throw new Error(`Falha HTTP ${ctx.status} ao contatar o serviço de notificações.`);
    }

    throw new Error(
      error.message || "Não foi possível acessar o serviço de notificações.",
    );
  }

  const result = (data ?? {}) as PushInvokeResult;
  if (!result.success) {
    throw new Error(
      `${result.message || "Não foi possível enviar a notificação."}${
        result.request_id ? ` (id: ${result.request_id})` : ""
      }`,
    );
  }

  return result;
}

/** Retry only on transient failures, with the idempotency key handled server-side. */
export async function chamarNotificacaoComRetry(body: Record<string, unknown>) {
  const delays = [0, 15000, 60000];
  let lastError: unknown;

  for (const delay of delays) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      return await chamarNotificacao(body);
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message ?? "");
      const transient =
        /Failed to send|network|timeout|demorou|HTTP 429|HTTP 5\d\d|ONESIGNAL_TIMEOUT|ONESIGNAL_NETWORK/i.test(msg);
      if (!transient) throw err;
    }
  }
  throw lastError;
}
