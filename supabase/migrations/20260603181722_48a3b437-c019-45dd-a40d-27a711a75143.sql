
-- Add email mirror to profiles for searching
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Backfill emails
UPDATE public.profiles p
   SET email = u.email
  FROM auth.users u
 WHERE u.id = p.user_id AND p.email IS DISTINCT FROM u.email;

-- Update handle_new_user to also store email and promote founder to super_admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

-- Ensure founder profile is super_admin/approved
UPDATE public.profiles
   SET role = 'super_admin', status = 'approved',
       approved_at = COALESCE(approved_at, now()),
       email = COALESCE(email, (SELECT email FROM auth.users WHERE id = profiles.user_id))
 WHERE user_id IN (SELECT id FROM auth.users WHERE lower(email) = 'thiagocbarreto@hotmail.com');

-- Treat super_admin as admin/staff in helper functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
      AND status = 'approved'
      AND (role = _role OR (role = 'super_admin' AND _role IN ('admin','editor','redator')))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
      AND status = 'approved'
      AND role IN ('super_admin','admin','editor','redator')
  );
$$;

-- Protect founder: cannot be deleted, blocked, demoted
CREATE OR REPLACE FUNCTION public.protect_super_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_email text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT email INTO target_email FROM auth.users WHERE id = OLD.user_id;
    IF lower(coalesce(target_email,'')) = 'thiagocbarreto@hotmail.com' THEN
      RAISE EXCEPTION 'Super admin cannot be deleted';
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT email INTO target_email FROM auth.users WHERE id = NEW.user_id;
    IF lower(coalesce(target_email,'')) = 'thiagocbarreto@hotmail.com' THEN
      NEW.role := 'super_admin';
      NEW.status := 'approved';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_super_admin_upd ON public.profiles;
CREATE TRIGGER protect_super_admin_upd
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin();

DROP TRIGGER IF EXISTS protect_super_admin_del ON public.profiles;
CREATE TRIGGER protect_super_admin_del
BEFORE DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin();

-- Update non-admin protect trigger to allow super_admin
CREATE OR REPLACE FUNCTION public.protect_profile_role_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.is_main_admin(auth.uid())
     OR public.has_role(auth.uid(), 'admin')
     OR public.has_role(auth.uid(), 'super_admin') THEN
    RETURN NEW;
  END IF;
  NEW.role := OLD.role;
  NEW.status := OLD.status;
  NEW.approved_at := OLD.approved_at;
  NEW.approved_by := OLD.approved_by;
  RETURN NEW;
END;
$$;
