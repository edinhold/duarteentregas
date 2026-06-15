DROP POLICY IF EXISTS "Users can self-assign user role" ON public.user_roles;

CREATE POLICY "Users can self-assign signup role"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND role IN ('user'::app_role, 'driver'::app_role, 'store_owner'::app_role)
  );