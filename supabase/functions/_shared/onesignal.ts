/**
 * Shared OneSignal REST helper for edge functions.
 * The App API Key is read from secrets and NEVER returned to clients.
 */

export const ONESIGNAL_API = "https://api.onesignal.com/notifications?c=push";

export function getOneSignalConfig() {
  const appId = Deno.env.get("ONESIGNAL_APP_ID") ?? "";
  const apiKey = Deno.env.get("ONESIGNAL_APP_API_KEY") ?? "";
  return { appId, apiKey, configured: Boolean(appId && apiKey) };
}

/** Removes anything sensitive before a response is logged or returned. */
export function sanitizeResponse(body: unknown) {
  try {
    const clone = JSON.parse(JSON.stringify(body ?? {}));
    delete clone.app_id;
    if (Array.isArray(clone.include_subscription_ids)) {
      clone.include_subscription_ids = `${clone.include_subscription_ids.length} ids`;
    }
    return clone;
  } catch {
    return { note: "unserializable response" };
  }
}

export interface SendResult {
  ok: boolean;
  httpStatus: number;
  notificationId: string | null;
  recipients: number;
  errors: unknown;
  sanitized: unknown;
  errorCode?: string;
}

/** Sends a notification and interprets the full OneSignal response body. */
export async function sendOneSignal(payload: Record<string, unknown>): Promise<SendResult> {
  const { appId, apiKey, configured } = getOneSignalConfig();
  if (!configured) {
    return {
      ok: false,
      httpStatus: 0,
      notificationId: null,
      recipients: 0,
      errors: "ONESIGNAL_APP_ID ou ONESIGNAL_APP_API_KEY ausente",
      sanitized: {},
      errorCode: "MISSING_CREDENTIALS",
    };
  }

  const body = { app_id: appId, target_channel: "push", ...payload };
  const res = await fetch(ONESIGNAL_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  let json: any = {};
  try {
    json = await res.json();
  } catch {
    json = { raw: "resposta não-JSON" };
  }

  const recipients = Number(json?.recipients ?? 0);
  const hasErrors =
    json?.errors &&
    (Array.isArray(json.errors) ? json.errors.length > 0 : Object.keys(json.errors).length > 0);

  let errorCode: string | undefined;
  if (res.status === 401 || res.status === 403) errorCode = "INVALID_CREDENTIALS";
  else if (res.status === 400) errorCode = "INVALID_PAYLOAD";
  else if (res.ok && recipients === 0) errorCode = "NO_RECIPIENTS";
  else if (!res.ok) errorCode = "SEND_FAILED";

  return {
    ok: res.ok && recipients > 0 && !hasErrors,
    httpStatus: res.status,
    notificationId: json?.id ?? null,
    recipients,
    errors: json?.errors ?? null,
    sanitized: sanitizeResponse(json),
    errorCode,
  };
}

/** Best-effort cancellation of an already-queued notification. */
export async function cancelOneSignal(notificationId: string): Promise<boolean> {
  const { appId, apiKey, configured } = getOneSignalConfig();
  if (!configured || !notificationId) return false;
  try {
    const res = await fetch(
      `https://api.onesignal.com/notifications/${notificationId}?app_id=${appId}`,
      { method: "DELETE", headers: { Authorization: `Key ${apiKey}` } },
    );
    return res.ok;
  } catch {
    return false;
  }
}
