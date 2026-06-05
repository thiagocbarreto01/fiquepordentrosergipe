BEGIN;

-- Bind contact-bearing complaint submissions to the authenticated submitter.
ALTER TABLE public.denuncias
  ADD COLUMN IF NOT EXISTS submitter_id uuid;

CREATE INDEX IF NOT EXISTS denuncias_submitter_id_idx
  ON public.denuncias (submitter_id);

DROP POLICY IF EXISTS "public submits anonymous or authenticated contact denuncia" ON public.denuncias;
DROP POLICY IF EXISTS "submit anonymous or own contact denuncia" ON public.denuncias;

CREATE POLICY "submit anonymous or own contact denuncia"
ON public.denuncias
FOR INSERT
TO public
WITH CHECK (
  char_length(title) >= 5
  AND char_length(title) <= 200
  AND char_length(description) >= 10
  AND char_length(description) <= 5000
  AND status = 'nova'::public.denuncia_status
  AND (
    (
      is_anonymous = true
      AND submitter_id IS NULL
      AND contact_name IS NULL
      AND contact_phone IS NULL
      AND contact_email IS NULL
    )
    OR
    (
      is_anonymous = false
      AND auth.uid() IS NOT NULL
      AND submitter_id = auth.uid()
    )
  )
);

-- Prevent non-admin users from changing sensitive profile fields, including the email mirror.
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_main_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  NEW.user_id := OLD.user_id;
  NEW.email := OLD.email;
  NEW.role := OLD.role;
  NEW.status := OLD.status;
  NEW.approved_at := OLD.approved_at;
  NEW.approved_by := OLD.approved_by;
  NEW.created_at := OLD.created_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_role_status_trigger ON public.profiles;
DROP TRIGGER IF EXISTS protect_profile_role_status_trg ON public.profiles;
DROP TRIGGER IF EXISTS protect_profile_sensitive_fields_trg ON public.profiles;

CREATE TRIGGER protect_profile_sensitive_fields_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_sensitive_fields();

REVOKE EXECUTE ON FUNCTION public.protect_profile_sensitive_fields() FROM PUBLIC, anon, authenticated;

-- Use column-level permissions so normal authenticated users can only self-edit non-sensitive profile fields.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name, avatar_url, bio, updated_at) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

COMMIT;