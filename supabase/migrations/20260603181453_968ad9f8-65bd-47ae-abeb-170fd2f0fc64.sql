
-- 1) Add approval tracking columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2) Founder helper (SECURITY DEFINER reads auth.users)
CREATE OR REPLACE FUNCTION public.is_main_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = _user_id
      AND lower(email) = 'thiagocbarreto@hotmail.com'
  );
$$;

-- 3) Drop recursive policies and rebuild without self-reference
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Self read
CREATE POLICY "profiles_self_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admin/founder read all
CREATE POLICY "profiles_admin_select_all"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_main_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- Self update (limited — cannot change role/status to escalate; enforced by trigger below)
CREATE POLICY "profiles_self_update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin/founder manage all
CREATE POLICY "profiles_admin_all"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_main_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_main_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- Allow profile insert by trigger (handle_new_user is SECURITY DEFINER so bypasses RLS anyway)

-- 4) Prevent non-admins from escalating their own role/status
CREATE OR REPLACE FUNCTION public.protect_profile_role_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- triggers from system / service role
  END IF;
  IF public.is_main_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  -- Non-admin: forbid changing role/status
  NEW.role := OLD.role;
  NEW.status := OLD.status;
  NEW.approved_at := OLD.approved_at;
  NEW.approved_by := OLD.approved_by;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_role_status_trg ON public.profiles;
CREATE TRIGGER protect_profile_role_status_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role_status();

-- 5) New signups default to pending (founder auto-approved)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_founder boolean := (lower(NEW.email) = 'thiagocbarreto@hotmail.com');
BEGIN
  INSERT INTO public.profiles (user_id, display_name, role, status, approved_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)),
    CASE WHEN is_founder THEN 'admin' ELSE 'user' END,
    CASE WHEN is_founder THEN 'approved' ELSE 'pending' END,
    CASE WHEN is_founder THEN now() ELSE NULL END
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 6) Guarantee founder profile exists and is admin/approved
INSERT INTO public.profiles (user_id, display_name, role, status, approved_at)
SELECT id, COALESCE(raw_user_meta_data->>'display_name', split_part(email,'@',1)), 'admin', 'approved', now()
FROM auth.users
WHERE lower(email) = 'thiagocbarreto@hotmail.com'
ON CONFLICT (user_id) DO UPDATE
SET role = 'admin', status = 'approved', approved_at = COALESCE(public.profiles.approved_at, now());
