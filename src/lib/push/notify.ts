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
const NON_BLOCKING_CODES = new Set([
  "JA_ENVIADO",
  "NO_RECIPIENTS",
  "NO_ACTIVE_SUBSCRIPTIONS",
]);

function notificationFunctionUrl() {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) {
    throw new Error("Configuração do backend ausente para notificações.");
  }
  return `${baseUrl.replace(/\/$/, "")}/functions/v1/${FUNCTION_NAME}`;
}

async function readResponseBody(response: Response): Promise<PushInvokeResult> {
  const text = await response.text();
  if (!text) return { success: response.ok };

  try {
    return JSON.parse(text) as PushInvokeResult;
  } catch {
    return {
      success: false,
      code: `HTTP_${response.status}`,
      message: text,
    };
  }
}

function formatPushError(result: PushInvokeResult, fallback: string) {
  const message = result.message || result.code || fallback;
  return `${message}${result.request_id ? ` (id: ${result.request_id})` : ""}`;
}

/**
 * Calls the push Edge Function with a validated session and surfaces the real
 * backend error message instead of the generic
 * "Failed to send a request to the Edge Function".
 */
export async function chamarNotificacao(
  body: Record<string, unknown>,
  options: { allowNonBlockingFailure?: boolean } = {},
): Promise<PushInvokeResult> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(`Falha ao verificar sessão: ${sessionError.message}`);
  }
  if (!sessionData.session) {
    throw new Error("Sua sessão expirou. Entre novamente no sistema.");
  }

  let response: Response;
  try {
    response = await fetch(notificationFunctionUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        "x-client-info": "duarte-entregas-push",
      },
      body: JSON.stringify(body),
    });
  } catch (error: any) {
    console.error("[push] falha de rede ao chamar função", error);
    throw new Error(error?.message || "Não foi possível acessar o serviço de notificações.");
  }

  const result = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(formatPushError(result, `Falha HTTP ${response.status}`));
  }

  if (
    !result.success &&
    !(options.allowNonBlockingFailure && NON_BLOCKING_CODES.has(String(result.code ?? "")))
  ) {
    throw new Error(formatPushError(result, "Não foi possível enviar a notificação."));
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
      return await chamarNotificacao(body, { allowNonBlockingFailure: true });
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
