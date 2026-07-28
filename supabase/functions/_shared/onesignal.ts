// deno-lint-ignore-file no-explicit-any

export const ONESIGNAL_API_ENDPOINT = "https://api.onesignal.com/notifications?c=push";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OneSignalAuthScheme = "Key" | "Bearer" | "Basic";

export interface OneSignalConfig {
  appId: string;
  restApiKey: string;
  authScheme: OneSignalAuthScheme;
  keyMeta: {
    length: number;
    sourceHadPrefix: boolean;
    looksLikeUuid: boolean;
    looksLikeUserKey: boolean;
    looksLikeModernAppKey: boolean;
  };
}

export interface OneSignalConfigError {
  ok: false;
  status: number;
  error: "onesignal_config_error";
  message: string;
  missing: string[];
  details: Record<string, unknown>;
}

export type OneSignalConfigResult = { ok: true; config: OneSignalConfig } | OneSignalConfigError;

function clean(value: string | undefined | null): string {
  return String(value ?? "").trim();
}

function normalizeSecret(raw: string): { value: string; scheme?: OneSignalAuthScheme; sourceHadPrefix: boolean } {
  const value = clean(raw);
  const prefixed = value.match(/^(Key|Bearer|Basic)\s+(.+)$/i);
  if (!prefixed) return { value, sourceHadPrefix: false };
  const scheme = prefixed[1].slice(0, 1).toUpperCase() + prefixed[1].slice(1).toLowerCase();
  return {
    value: prefixed[2].trim(),
    scheme: scheme as OneSignalAuthScheme,
    sourceHadPrefix: true,
  };
}

function normalizeScheme(value: string | undefined | null): OneSignalAuthScheme | undefined {
  const normalized = clean(value).toLowerCase();
  if (normalized === "key") return "Key";
  if (normalized === "bearer") return "Bearer";
  if (normalized === "basic") return "Basic";
  return undefined;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function getOneSignalConfig(): OneSignalConfigResult {
  const appId = clean(Deno.env.get("ONESIGNAL_APP_ID"));
  const rawKey = clean(Deno.env.get("ONESIGNAL_REST_API_KEY"));
  const normalizedKey = normalizeSecret(rawKey);
  const restApiKey = normalizedKey.value;
  const missing = [
    !appId ? "ONESIGNAL_APP_ID" : null,
    !restApiKey ? "ONESIGNAL_REST_API_KEY" : null,
  ].filter((name): name is string => Boolean(name));

  const keyMeta = {
    length: restApiKey.length,
    sourceHadPrefix: normalizedKey.sourceHadPrefix,
    looksLikeUuid: isUuid(restApiKey),
    looksLikeUserKey: /^os_v2_user_/i.test(restApiKey),
    looksLikeModernAppKey: /^os_v2_app_/i.test(restApiKey),
  };

  if (missing.length > 0) {
    return {
      ok: false,
      status: 500,
      error: "onesignal_config_error",
      message: `Configuração OneSignal incompleta: variável ausente ${missing.join(", ")}.`,
      missing,
      details: { app_id_present: !!appId, rest_api_key_present: !!restApiKey, key_meta: keyMeta },
    };
  }

  if (!isUuid(appId)) {
    return {
      ok: false,
      status: 500,
      error: "onesignal_config_error",
      message: "ONESIGNAL_APP_ID inválido: informe o App ID do aplicativo OneSignal em formato UUID.",
      missing: [],
      details: { app_id_present: true, rest_api_key_present: true, key_meta: keyMeta },
    };
  }

  if (restApiKey === appId || keyMeta.looksLikeUuid) {
    return {
      ok: false,
      status: 500,
      error: "onesignal_config_error",
      message: "ONESIGNAL_REST_API_KEY parece ser um App ID. Salve a REST API Key do aplicativo OneSignal, não o App ID.",
      missing: [],
      details: { app_id_present: true, rest_api_key_present: true, key_meta: keyMeta },
    };
  }

  if (keyMeta.looksLikeUserKey) {
    return {
      ok: false,
      status: 500,
      error: "onesignal_config_error",
      message: "ONESIGNAL_REST_API_KEY parece ser uma User Auth Key. Use a REST API Key específica do aplicativo OneSignal.",
      missing: [],
      details: { app_id_present: true, rest_api_key_present: true, key_meta: keyMeta },
    };
  }

  return {
    ok: true,
    config: {
      appId,
      restApiKey,
      authScheme: normalizeScheme(Deno.env.get("ONESIGNAL_AUTH_SCHEME")) ?? normalizedKey.scheme ?? "Key",
      keyMeta,
    },
  };
}

export function oneSignalHeaders(config: OneSignalConfig): HeadersInit {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `${config.authScheme} ${config.restApiKey}`,
  };
}

export async function readOneSignalResponse(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export function configErrorResponse(error: OneSignalConfigError): Response {
  console.error("[OneSignal:ConfigError]", {
    message: error.message,
    missing: error.missing,
    details: error.details,
  });
  return new Response(JSON.stringify(error), {
    status: error.status,
    headers: { "Content-Type": "application/json" },
  });
}

export function safeOneSignalLogConfig(config: OneSignalConfig): Record<string, unknown> {
  return {
    app_id: config.appId,
    auth_scheme: config.authScheme,
    endpoint: ONESIGNAL_API_ENDPOINT,
    key_meta: config.keyMeta,
  };
}

export function summarizeOneSignalUser(value: any): Record<string, unknown> {
  const subscriptions = Array.isArray(value?.subscriptions) ? value.subscriptions : [];
  return {
    identity: value?.identity ?? null,
    properties: value?.properties
      ? {
          tags: value.properties.tags ?? null,
          language: value.properties.language ?? null,
          country: value.properties.country ?? null,
          timezone_id: value.properties.timezone_id ?? null,
          first_active: value.properties.first_active ?? null,
          last_active: value.properties.last_active ?? null,
        }
      : null,
    subscription_count: subscriptions.length,
    active_subscription_count: subscriptions.filter((subscription: any) => (
      subscription?.enabled && Number(subscription?.notification_types ?? 0) > 0
    )).length,
    subscriptions: subscriptions.map((subscription: any) => ({
      id: subscription?.id ?? null,
      type: subscription?.type ?? null,
      enabled: subscription?.enabled ?? null,
      notification_types: subscription?.notification_types ?? null,
      session_count: subscription?.session_count ?? null,
      device_model: subscription?.device_model ?? null,
      device_os: subscription?.device_os ?? null,
      app_version: subscription?.app_version ?? null,
    })),
  };
}