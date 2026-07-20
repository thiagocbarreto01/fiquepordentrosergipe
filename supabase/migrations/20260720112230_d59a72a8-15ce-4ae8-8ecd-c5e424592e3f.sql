CREATE OR REPLACE FUNCTION public.can_approve_publish(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'editor'::public.app_role)
      OR public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'super_admin'::public.app_role);
$$;