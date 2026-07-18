
-- 1) Add super_admin to enum (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
    WHERE t.typname='app_role' AND e.enumlabel='super_admin'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'super_admin';
  END IF;
END $$;
COMMIT;

-- 2) is_approved_active_user helper
CREATE OR REPLACE FUNCTION public.is_approved_active_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND status = 'approved'
  );
$$;

-- 3) Harden has_role variants to require approved status
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND p.status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role::text = _role
      AND p.status = 'approved'
  );
$$;

-- 4) is_staff / is_editor_or_admin also require approved
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role IN ('admin'::public.app_role,'editor'::public.app_role,'redator'::public.app_role,'super_admin'::public.app_role)
      AND p.status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_editor_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role IN ('admin'::public.app_role,'editor'::public.app_role,'super_admin'::public.app_role)
      AND p.status = 'approved'
  );
$$;

-- 5) Backfill missing user_roles entries for current super_admins
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'super_admin'::public.app_role
FROM public.profiles p
WHERE p.role = 'super_admin'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = 'super_admin'::public.app_role)
ON CONFLICT DO NOTHING;

-- ensure super_admins also have admin role for older policies
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'admin'::public.app_role
FROM public.profiles p
WHERE p.role = 'super_admin'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = 'admin'::public.app_role)
ON CONFLICT DO NOTHING;

-- 6) admin_set_user_role RPC — syncs profiles + user_roles atomically
CREATE OR REPLACE FUNCTION public.admin_set_user_role(_user_id uuid, _role text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  target_email text;
  valid_roles text[] := ARRAY['super_admin','admin','editor','redator','user'];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='28000'; END IF;
  IF NOT (public.has_role(uid,'admin'::public.app_role) OR public.has_role(uid,'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _role IS NULL OR NOT (_role = ANY(valid_roles)) THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE='22023';
  END IF;
  IF uid = _user_id AND _role <> 'super_admin' AND _role <> 'admin' THEN
    RAISE EXCEPTION 'cannot_demote_self' USING ERRCODE='42501';
  END IF;

  SELECT email INTO target_email FROM auth.users WHERE id = _user_id;
  IF lower(coalesce(target_email,'')) = 'thiagocbarreto@hotmail.com' AND _role <> 'super_admin' THEN
    RAISE EXCEPTION 'founder_role_locked' USING ERRCODE='42501';
  END IF;

  UPDATE public.profiles SET role = _role WHERE user_id = _user_id;

  -- Sync user_roles: clear then insert canonical role(s)
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  IF _role = 'super_admin' THEN
    INSERT INTO public.user_roles(user_id, role) VALUES
      (_user_id, 'super_admin'::public.app_role),
      (_user_id, 'admin'::public.app_role);
  ELSIF _role IN ('admin','editor','redator') THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, _role::public.app_role);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;

-- 7) admin_set_user_status RPC
CREATE OR REPLACE FUNCTION public.admin_set_user_status(_user_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  target_email text;
  valid text[] := ARRAY['pending','approved','rejected','blocked'];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='28000'; END IF;
  IF NOT (public.has_role(uid,'admin'::public.app_role) OR public.has_role(uid,'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _status IS NULL OR NOT (_status = ANY(valid)) THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE='22023';
  END IF;
  IF uid = _user_id AND _status <> 'approved' THEN
    RAISE EXCEPTION 'cannot_change_own_status' USING ERRCODE='42501';
  END IF;

  SELECT email INTO target_email FROM auth.users WHERE id = _user_id;
  IF lower(coalesce(target_email,'')) = 'thiagocbarreto@hotmail.com' AND _status <> 'approved' THEN
    RAISE EXCEPTION 'founder_status_locked' USING ERRCODE='42501';
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

-- 8) Update handle_new_user to seed user_roles for founder
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  is_founder boolean := (lower(NEW.email) = 'thiagocbarreto@hotmail.com');
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email, role, status, approved_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)),
    NEW.email,
    CASE WHEN is_founder THEN 'super_admin' ELSE 'user' END,
    CASE WHEN is_founder THEN 'approved' ELSE 'pending' END,
    CASE WHEN is_founder THEN now() ELSE NULL END
  )
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;

  IF is_founder THEN
    INSERT INTO public.user_roles(user_id, role)
    VALUES (NEW.id, 'super_admin'::public.app_role), (NEW.id, 'admin'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- 9) Protect founder in user_roles
CREATE OR REPLACE FUNCTION public.protect_founder_user_roles()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  target_email text;
BEGIN
  SELECT email INTO target_email FROM auth.users
   WHERE id = COALESCE(OLD.user_id, NEW.user_id);
  IF lower(coalesce(target_email,'')) = 'thiagocbarreto@hotmail.com' THEN
    IF TG_OP = 'DELETE' AND OLD.role IN ('admin'::public.app_role,'super_admin'::public.app_role) THEN
      RAISE EXCEPTION 'founder_role_locked';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS protect_founder_user_roles_trg ON public.user_roles;
CREATE TRIGGER protect_founder_user_roles_trg
  BEFORE DELETE OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_founder_user_roles();
