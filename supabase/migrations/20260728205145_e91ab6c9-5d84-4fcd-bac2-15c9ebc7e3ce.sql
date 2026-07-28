ALTER TABLE public.onesignal_devices
  ADD COLUMN IF NOT EXISTS profile_type text,
  ADD COLUMN IF NOT EXISTS onesignal_subscription_id text,
  ADD COLUMN IF NOT EXISTS onesignal_external_id text,
  ADD COLUMN IF NOT EXISTS push_token text,
  ADD COLUMN IF NOT EXISTS permission_status text,
  ADD COLUMN IF NOT EXISTS subscription_status text,
  ADD COLUMN IF NOT EXISTS device_model text,
  ADD COLUMN IF NOT EXISTS app_version text;

UPDATE public.onesignal_devices
SET onesignal_subscription_id = COALESCE(onesignal_subscription_id, subscription_id),
    onesignal_external_id = COALESCE(onesignal_external_id, external_id),
    subscription_status = COALESCE(subscription_status, CASE WHEN status = 'active' THEN 'subscribed' WHEN status = 'opted_out' THEN 'unsubscribed' ELSE status END),
    permission_status = COALESCE(permission_status, CASE WHEN status = 'active' THEN 'granted' WHEN status = 'opted_out' THEN 'denied' ELSE 'unknown' END),
    profile_type = COALESCE(profile_type, 'driver')
WHERE onesignal_subscription_id IS NULL
   OR onesignal_external_id IS NULL
   OR subscription_status IS NULL
   OR permission_status IS NULL
   OR profile_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_onesignal_devices_subscription
  ON public.onesignal_devices(onesignal_subscription_id)
  WHERE onesignal_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_onesignal_devices_active_profile
  ON public.onesignal_devices(profile_type, subscription_status, permission_status, last_synced_at DESC);

DROP POLICY IF EXISTS "Admins can view onesignal devices" ON public.onesignal_devices;
CREATE POLICY "Admins can view onesignal devices"
  ON public.onesignal_devices
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));