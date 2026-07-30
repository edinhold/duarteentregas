/**
 * OneSignal REST helper (API v16) — shared by every push edge function.
 *
 * SECURITY: the App API Key is read from the edge-function secrets and never
 * leaves this module. It is never returned, logged or echoed in an error.
 */

export const ONESIGNAL_ENDPOINT = "https://api.onesignal.com/notifications";

/**
 * Android notification channel.
 *
 * IMPORTANT: `android_channel_id` must be the UUID of a channel created in the
 * OneSignal dashboard, and `existing_android_channel_id` the *native* channel
 * id created by an Android app. Sending an invalid/dashboard-less value makes
 * OneSignal answer 400 "Could not find android_channel_id".
 *
 * This project ships a Web/PWA build (plus a Median wrapper), so by default NO
 * Android channel field is sent. Set one of the secrets below only when a real
 * channel exists.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AndroidChannel {
  /** "dashboard" => android_channel_id, "native" => existing_android_channel_id */
  mode: "dashboard" | "native" | "none";
  id: string | null;
  /** Set when a secret is present but unusable (e.g. not a UUID). */
  warning?: string;
}

export function getAndroidChannel(): AndroidChannel {
  const dashboard = (Deno.env.get("ONESIGNAL_ANDROID_CHANNEL_ID") ?? "").trim();
  const native = (Deno.env.get("ONESIGNAL_EXISTING_ANDROID_CHANNEL_ID") ?? "").trim();

  if (dashboard && native) {
    return {
      mode: "none",
      id: null,
      warning:
        "Defina apenas ONESIGNAL_ANDROID_CHANNEL_ID ou ONESIGNAL_EXISTING_ANDROID_CHANNEL_ID.",
    };
  }
  if (dashboard) {
    if (!UUID_RE.test(dashboard)) {
      return {
        mode: "none",
        id: null,
        warning:
          "ONESIGNAL_ANDROID_CHANNEL_ID não é o UUID do canal no painel do OneSignal — campo ignorado.",
      };
    }
    return { mode: "dashboard", id: dashboard };
  }
  if (native) return { mode: "native", id: native };
  return { mode: "none", id: null };
}

/** Android-only keys that must never reach a Web Push / PWA payload. */
const ANDROID_ONLY_KEYS = [
  "android_channel_id",
  "existing_android_channel_id",
  "android_sound",
  "android_visibility",
  "small_icon",
  "large_icon",
  "adm_small_icon",
  "adm_large_icon",
];

/**
 * Returns a payload tailored to the target platform:
 *  - "web"           → every Android-only field removed;
 *  - "android_native"→ the configured channel field added, when valid.
 */
export function buildPlatformPayload(
  base: Record<string, unknown>,
  platform: "web" | "android_native",
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...base };
  for (const key of ANDROID_ONLY_KEYS) delete payload[key];

  if (platform === "android_native") {
    payload.android_visibility = 1;
    const channel = getAndroidChannel();
    if (channel.mode === "dashboard" && channel.id) payload.android_channel_id = channel.id;
    if (channel.mode === "native" && channel.id) payload.existing_android_channel_id = channel.id;
  }

  // Never ship empty / undefined values — OneSignal rejects them.
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null || value === "") delete payload[key];
  }
  return payload;
}

/** OneSignal accepts up to 20.000 subscription ids per call; stay well under. */
export const MAX_IDS_PER_REQUEST = 2000;

export interface OneSignalConfig {
  appId: string;
  apiKey: string;
  configured: boolean;
  missing: string[];
}

export function getOneSignalConfig(): OneSignalConfig {
  const appId = (Deno.env.get("ONESIGNAL_APP_ID") ?? "").trim();
  const apiKey = (Deno.env.get("ONESIGNAL_APP_API_KEY") ?? "").trim();
  const missing: string[] = [];
  if (!appId) missing.push("ONESIGNAL_APP_ID");
  if (!apiKey) missing.push("ONESIGNAL_APP_API_KEY");
  return { appId, apiKey, configured: missing.length === 0, missing };
}

/** Masked app id for diagnostics screens (never expose the API key at all). */
export function maskAppId(appId: string): string {
  if (!appId) return "—";
  if (appId.length <= 12) return `${appId.slice(0, 4)}…`;
  return `${appId.slice(0, 8)}…${appId.slice(-4)}`;
}

/** Strips credentials / bulky id arrays before anything is logged or returned. */
export function sanitizeResponse(body: unknown): Record<string, unknown> {
  try {
    const clone = JSON.parse(JSON.stringify(body ?? {}));
    delete clone.app_id;
    delete clone.api_key;
    delete clone.Authorization;
    if (Array.isArray(clone.include_subscription_ids)) {
      clone.include_subscription_ids = `${clone.include_subscription_ids.length} ids`;
    }
    if (Array.isArray(clone.include_aliases?.external_id)) {
      clone.include_aliases = `${clone.include_aliases.external_id.length} aliases`;
    }
    return clone;
  } catch {
    return { note: "resposta não serializável" };
  }
}

export interface SendResult {
  ok: boolean;
  httpStatus: number;
  notificationId: string | null;
  /** Recipients OneSignal claims it will deliver to (accepted, not "shown"). */
  recipients: number;
  errorCode?: string;
  errorMessage?: string;
  sanitized: Record<string, unknown>;
}

/**
 * POSTs one notification and interprets the FULL response body, not only the
 * HTTP status — OneSignal answers 200 with `errors` for invalid recipients.
 */
export async function sendOneSignal(
  payload: Record<string, unknown>,
): Promise<SendResult> {
  const { appId, apiKey, configured, missing } = getOneSignalConfig();
  if (!configured) {
    return {
      ok: false,
      httpStatus: 0,
      notificationId: null,
      recipients: 0,
      errorCode: "MISSING_CREDENTIALS",
      errorMessage: `Secrets ausentes: ${missing.join(", ")}`,
      sanitized: {},
    };
  }

  const body = { app_id: appId, target_channel: "push", ...payload };

  let res: Response;
  try {
    res = await fetch(ONESIGNAL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      httpStatus: 0,
      notificationId: null,
      recipients: 0,
      errorCode: "NETWORK_ERROR",
      errorMessage: `Falha de rede ao contatar o OneSignal: ${err}`,
      sanitized: {},
    };
  }

  let json: Record<string, any> = {};
  try {
    json = await res.json();
  } catch {
    json = { raw: "resposta não-JSON" };
  }

  const notificationId = typeof json?.id === "string" && json.id ? json.id : null;
  const recipients = Number(json?.recipients ?? 0);

  const rawErrors = json?.errors;
  const errorList: string[] = Array.isArray(rawErrors)
    ? rawErrors.map(String)
    : rawErrors && typeof rawErrors === "object"
    ? Object.entries(rawErrors).map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    : [];

  let errorCode: string | undefined;
  let errorMessage: string | undefined;

  if (res.status === 401 || res.status === 403) {
    errorCode = "INVALID_CREDENTIALS";
    errorMessage = "App API Key rejeitada pelo OneSignal (401/403).";
  } else if (res.status === 400) {
    errorCode = "INVALID_PAYLOAD";
    errorMessage = errorList.join(" | ") || "Payload recusado pelo OneSignal.";
  } else if (res.status === 429) {
    errorCode = "RATE_LIMITED";
    errorMessage = "Limite de requisições do OneSignal atingido.";
  } else if (!res.ok) {
    errorCode = "SEND_FAILED";
    errorMessage = errorList.join(" | ") || `HTTP ${res.status}`;
  } else if (recipients === 0) {
    errorCode = "NO_RECIPIENTS";
    errorMessage = errorList.join(" | ") ||
      "Nenhum destinatário elegível — inscrições podem estar inválidas.";
  } else if (errorList.length > 0) {
    // Partial success: accepted, but some ids were invalid.
    errorCode = "PARTIAL";
    errorMessage = errorList.join(" | ");
  }

  return {
    ok: res.ok && recipients > 0,
    httpStatus: res.status,
    notificationId,
    recipients,
    errorCode,
    errorMessage,
    sanitized: sanitizeResponse(json),
  };
}

/** Best-effort removal of a queued/delivered notification. */
export async function cancelOneSignal(notificationId: string): Promise<boolean> {
  const { appId, apiKey, configured } = getOneSignalConfig();
  if (!configured || !notificationId) return false;
  try {
    const res = await fetch(
      `${ONESIGNAL_ENDPOINT}/${notificationId}?app_id=${encodeURIComponent(appId)}`,
      { method: "DELETE", headers: { Authorization: `Key ${apiKey}` } },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Splits subscription ids into API-safe chunks. */
export function chunk<T>(items: T[], size = MAX_IDS_PER_REQUEST): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
