/**
 * Public OneSignal App ID, fetched once from the `push-config` edge function.
 *
 * Keeping the id server-side guarantees the PWA and the APK always initialise
 * against the SAME OneSignal app, and leaves no id hardcoded in the bundle.
 * The App API Key never reaches the client.
 */
import { supabase } from "@/integrations/supabase/client";

export interface PushConfig {
  appId: string | null;
  appIdMasked: string | null;
  androidChannelId: string;
  configured: boolean;
  missingSecrets: string[];
}

let cache: PushConfig | null = null;
let inflight: Promise<PushConfig | null> | null = null;

export async function getPushConfig(force = false): Promise<PushConfig | null> {
  if (cache && !force) return cache;
  if (inflight && !force) return inflight;

  inflight = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("push-config", { body: {} });
      if (error) throw error;
      cache = {
        appId: data?.app_id ?? null,
        appIdMasked: data?.app_id_masked ?? null,
        androidChannelId: data?.android_channel_id ?? "novas_entregas_v1",
        configured: Boolean(data?.configured),
        missingSecrets: data?.missing_secrets ?? [],
      };
      return cache;
    } catch (err) {
      console.log("[Push] Falha ao obter configuração", err);
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function clearPushConfigCache() {
  cache = null;
}
