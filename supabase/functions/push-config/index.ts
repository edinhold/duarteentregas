/**
 * push-config — returns the PUBLIC OneSignal App ID to authenticated clients.
 *
 * The App ID is public by design (it ships inside every SDK). Serving it from
 * a secret keeps the frontend free of hardcoded ids and guarantees the PWA and
 * the APK always initialise against the very same OneSignal app.
 * The App API Key is NEVER part of this response.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getOneSignalConfig, ANDROID_CHANNEL_ID, maskAppId } from "../_shared/onesignal.ts";
import { jsonResponse, requireUser } from "../_shared/push-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await requireUser(req);
  if (!caller) {
    return jsonResponse({ error: "Não autenticado" }, 401, corsHeaders);
  }

  const { appId, configured, missing } = getOneSignalConfig();

  return jsonResponse(
    {
      app_id: appId || null,
      app_id_masked: maskAppId(appId),
      android_channel_id: ANDROID_CHANNEL_ID,
      configured,
      missing_secrets: missing,
    },
    200,
    corsHeaders,
  );
});
