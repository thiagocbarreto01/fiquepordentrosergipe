
-- 1) is_founder em profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_founder boolean NOT NULL DEFAULT false;

UPDATE public.profiles p
   SET is_founder = true
  FROM auth.users u
 WHERE u.id = p.user_id
   AND lower(u.email) = 'thiagocbarreto@hotmail.com';

-- 2) Remove trigger obsoleto que rebaixava fundador para 'admin'
DROP TRIGGER IF EXISTS trg_ensure_founder_access ON public.profiles;
DROP FUNCTION IF EXISTS public.ensure_founder_access();

-- 3) Deduplica user_roles: super_admin não precisa também de 'admin'
--    Desabilita temporariamente o trigger de proteção do fundador (é uma operação interna, não uma ação de usuário)
ALTER TABLE public.user_roles DISABLE TRIGGER protect_founder_user_roles_trg;
DELETE FROM public.user_roles ur
 WHERE ur.role = 'admin'::public.app_role
   AND EXISTS (
     SELECT 1 FROM public.user_roles ur2
      WHERE ur2.user_id = ur.user_id
        AND ur2.role = 'super_admin'::public.app_role
   );
ALTER TABLE public.user_roles ENABLE TRIGGER protect_founder_user_roles_trg;

-- 4) Grants mínimos
REVOKE ALL ON public.profiles FROM PUBLIC, anon;
REVOKE ALL ON public.user_roles FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.user_roles TO service_role;

-- 5) RLS: escrita via RPC SECURITY DEFINER; leitura ampla só p/ admin/super_admin
DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_select_all ON public.profiles;
DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "users see own roles" ON public.user_roles;

CREATE POLICY profiles_staff_admin_select_all ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY user_roles_self_select ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- 6) admin_set_user_role endurecido
CREATE OR REPLACE FUNCTION public.admin_set_user_role(_user_id uuid, _role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  target_is_founder boolean;
  target_current_role public.app_role;
  caller_is_super boolean;
  caller_is_admin boolean;
  remaining_admins int;
  valid_roles text[] := ARRAY['super_admin','admin','editor','redator','user'];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='28000'; END IF;

  caller_is_super := public.has_role(uid,'super_admin'::public.app_role);
  caller_is_admin := public.has_role(uid,'admin'::public.app_role) OR caller_is_super;
  IF NOT caller_is_admin THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  IF _role IS NULL OR NOT (_role = ANY(valid_roles)) THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE='22023';
  END IF;

  IF uid = _user_id THEN
    RAISE EXCEPTION 'cannot_change_own_role' USING ERRCODE='42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text, 42));

  SELECT is_founder, role INTO target_is_founder, target_current_role
    FROM public.profiles WHERE user_id = _user_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found' USING ERRCODE='P0002'; END IF;

  IF target_is_founder AND _role <> 'super_admin' THEN
    RAISE EXCEPTION 'founder_role_locked' USING ERRCODE='42501';
  END IF;

  IF target_current_role = 'super_admin' AND NOT caller_is_super THEN
    RAISE EXCEPTION 'requires_super_admin' USING ERRCODE='42501';
  END IF;

  IF _role = 'super_admin' AND NOT caller_is_super THEN
    RAISE EXCEPTION 'requires_super_admin' USING ERRCODE='42501';
  END IF;

  IF target_current_role IN ('admin','super_admin')
     AND _role NOT IN ('admin','super_admin') THEN
    SELECT count(*) INTO remaining_admins
      FROM public.profiles
     WHERE status = 'approved'
       AND role IN ('admin','super_admin')
       AND user_id <> _user_id;
    IF remaining_admins = 0 THEN
      RAISE EXCEPTION 'last_admin_protected' USING ERRCODE='42501';
    END IF;
  END IF;

  -- Deduplicação: super_admin agora é registro único
  ALTER TABLE public.user_roles DISABLE TRIGGER protect_founder_user_roles_trg;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  ALTER TABLE public.user_roles ENABLE TRIGGER protect_founder_user_roles_trg;

  INSERT INTO public.user_roles(user_id, role)
    VALUES (_user_id, _role::public.app_role)
    ON CONFLICT DO NOTHING;

  UPDATE public.profiles SET role = _role WHERE user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;

-- 7) admin_set_user_status endurecido
CREATE OR REPLACE FUNCTION public.admin_set_user_status(_user_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  target_is_founder boolean;
  target_current_role public.app_role;
  target_current_status text;
  caller_is_super boolean;
  caller_is_admin boolean;
  remaining_admins int;
  valid text[] := ARRAY['pending','approved','rejected','blocked'];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='28000'; END IF;

  caller_is_super := public.has_role(uid,'super_admin'::public.app_role);
  caller_is_admin := public.has_role(uid,'admin'::public.app_role) OR caller_is_super;
  IF NOT caller_is_admin THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  IF _status IS NULL OR NOT (_status = ANY(valid)) THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE='22023';
  END IF;

  IF uid = _user_id AND _status <> 'approved' THEN
    RAISE EXCEPTION 'cannot_change_own_status' USING ERRCODE='42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text, 42));

  SELECT is_founder, role, status
    INTO target_is_founder, target_current_role, target_current_status
    FROM public.profiles WHERE user_id = _user_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found' USING ERRCODE='P0002'; END IF;

  IF target_is_founder AND _status <> 'approved' THEN
    RAISE EXCEPTION 'founder_status_locked' USING ERRCODE='42501';
  END IF;

  IF target_current_role = 'super_admin' AND NOT caller_is_super THEN
    RAISE EXCEPTION 'requires_super_admin' USING ERRCODE='42501';
  END IF;

  IF target_current_role IN ('admin','super_admin')
     AND target_current_status = 'approved'
     AND _status <> 'approved' THEN
    SELECT count(*) INTO remaining_admins
      FROM public.profiles
     WHERE status = 'approved'
       AND role IN ('admin','super_admin')
       AND user_id <> _user_id;
    IF remaining_admins = 0 THEN
      RAISE EXCEPTION 'last_admin_protected' USING ERRCODE='42501';
    END IF;
  END IF;

  IF _status = 'approved' THEN
    UPDATE public.profiles
       SET status = 'approved',
           approved_at = COALESCE(approved_at, now()),
           approved_by = COALESCE(approved_by, uid)
     WHERE user_id = _user_id;
  ELSE
    UPDATE public.profiles SET status = _status WHERE user_id = _user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(uuid, text) TO authenticated;

-- 8) handle_new_user: mantém super_admin canônico para fundador, marca is_founder
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_founder_user boolean := (lower(NEW.email) = 'thiagocbarreto@hotmail.com');
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email, role, status, approved_at, is_founder)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)),
    NEW.email,
    CASE WHEN is_founder_user THEN 'super_admin' ELSE 'user' END,
    CASE WHEN is_founder_user THEN 'approved' ELSE 'pending' END,
    CASE WHEN is_founder_user THEN now() ELSE NULL END,
    is_founder_user
  )
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;

  IF is_founder_user THEN
    INSERT INTO public.user_roles(user_id, role)
    VALUES (NEW.id, 'super_admin'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
