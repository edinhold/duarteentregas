-- ============================================================
-- Migration: OneSignal Device Management & Exclusive Acceptance
-- ============================================================

-- 1. Tabela motorista_dispositivos
CREATE TABLE IF NOT EXISTS public.motorista_dispositivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  onesignal_subscription_id text NOT NULL UNIQUE,
  plataforma text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- Garantir índice único parcial: APENAS UM dispositivo ativo por motorista!
CREATE UNIQUE INDEX IF NOT EXISTS idx_motorista_dispositivos_single_active
  ON public.motorista_dispositivos (motorista_id)
  WHERE (status = 'active');

CREATE INDEX IF NOT EXISTS idx_motorista_dispositivos_motorista ON public.motorista_dispositivos(motorista_id);
CREATE INDEX IF NOT EXISTS idx_motorista_dispositivos_status ON public.motorista_dispositivos(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.motorista_dispositivos TO authenticated;
GRANT ALL ON public.motorista_dispositivos TO service_role;

ALTER TABLE public.motorista_dispositivos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Drivers manage own devices' AND tablename = 'motorista_dispositivos') THEN
    CREATE POLICY "Drivers manage own devices" ON public.motorista_dispositivos
      FOR ALL TO authenticated
      USING (motorista_id = auth.uid())
      WITH CHECK (motorista_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins read all devices' AND tablename = 'motorista_dispositivos') THEN
    CREATE POLICY "Admins read all devices" ON public.motorista_dispositivos
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

CREATE TRIGGER trg_motorista_dispositivos_updated_at
  BEFORE UPDATE ON public.motorista_dispositivos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. RPC registrar_dispositivo_motorista
CREATE OR REPLACE FUNCTION public.registrar_dispositivo_motorista(
  p_subscription_id text,
  p_plataforma text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_subscription_id IS NULL OR trim(p_subscription_id) = '' THEN
    RAISE EXCEPTION 'onesignal_subscription_id é obrigatório';
  END IF;

  -- Inativar dispositivos anteriores do mesmo motorista
  UPDATE public.motorista_dispositivos
     SET status = 'inactive',
         updated_at = now()
   WHERE motorista_id = v_user
     AND onesignal_subscription_id <> p_subscription_id
     AND status = 'active';

  -- Upsert no dispositivo atual
  INSERT INTO public.motorista_dispositivos (
    motorista_id, onesignal_subscription_id, plataforma, status, last_seen_at, updated_at
  )
  VALUES (
    v_user, p_subscription_id, p_plataforma, 'active', now(), now()
  )
  ON CONFLICT (onesignal_subscription_id)
  DO UPDATE SET
    motorista_id = EXCLUDED.motorista_id,
    plataforma = EXCLUDED.plataforma,
    status = 'active',
    last_seen_at = now(),
    updated_at = now();

  -- Sincronização com push_subscriptions
  INSERT INTO public.push_subscriptions (
    user_id, profile_type, platform, onesignal_subscription_id, permission_status, subscription_status, active, last_seen_at, updated_at
  )
  VALUES (
    v_user, 'driver', p_plataforma, p_subscription_id, 'granted', 'subscribed', true, now(), now()
  )
  ON CONFLICT (onesignal_subscription_id)
  DO UPDATE SET
    user_id = EXCLUDED.user_id,
    platform = EXCLUDED.platform,
    active = true,
    permission_status = 'granted',
    subscription_status = 'subscribed',
    last_seen_at = now(),
    updated_at = now();

  UPDATE public.push_subscriptions
     SET active = false,
         subscription_status = 'unsubscribed',
         updated_at = now()
   WHERE user_id = v_user
     AND onesignal_subscription_id <> p_subscription_id;

  RETURN jsonb_build_object('success', true, 'motorista_id', v_user, 'subscription_id', p_subscription_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.registrar_dispositivo_motorista(text, text) TO authenticated;

-- 3. RPC remover_dispositivo_motorista
CREATE OR REPLACE FUNCTION public.remover_dispositivo_motorista(
  p_subscription_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  v_is_admin := public.has_role(v_user, 'admin'::app_role);

  UPDATE public.motorista_dispositivos
     SET status = 'deleted',
         updated_at = now()
   WHERE onesignal_subscription_id = p_subscription_id
     AND (motorista_id = v_user OR v_is_admin);

  UPDATE public.push_subscriptions
     SET active = false,
         subscription_status = 'deleted',
         updated_at = now()
   WHERE onesignal_subscription_id = p_subscription_id
     AND (user_id = v_user OR v_is_admin);

  RETURN jsonb_build_object('success', true, 'subscription_id', p_subscription_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.remover_dispositivo_motorista(text) TO authenticated;

-- 4. RPC accept_delivery_request (Aceite Exclusivo com FOR UPDATE)
CREATE OR REPLACE FUNCTION public.accept_delivery_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_req RECORD;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.has_role(v_user, 'driver'::app_role) THEN
    RAISE EXCEPTION 'Apenas motoristas podem aceitar entregas';
  END IF;

  -- Lock da linha para concorrência
  SELECT id, status, driver_id, driver_fee, group_id
    INTO v_req
    FROM public.delivery_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta entrega não foi encontrada.';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Esta entrega já foi aceita por outro motorista.';
  END IF;

  IF v_req.driver_id IS NOT NULL AND v_req.driver_id <> v_user THEN
    RAISE EXCEPTION 'Esta entrega foi direcionada a outro motorista.';
  END IF;

  UPDATE public.delivery_requests
     SET driver_id = v_user,
         status = 'accepted',
         accepted_at = now(),
         updated_at = now()
   WHERE id = p_request_id
     AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta entrega já foi aceita por outro motorista.';
  END IF;

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'driver_fee', v_req.driver_fee,
    'status', 'accepted',
    'accepted_at', now()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_delivery_request(uuid) TO authenticated;
