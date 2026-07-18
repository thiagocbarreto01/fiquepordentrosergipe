
-- 1) Fechar vazamento: anon não deve ler flags internas
DROP POLICY IF EXISTS "public read site settings" ON public.site_settings;
REVOKE SELECT ON public.site_settings FROM anon;

-- Admin já tem ALL via policy "admin manage site settings"; adicionamos leitura para authenticated staff-only
CREATE POLICY "admin read site settings"
  ON public.site_settings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) Validação no banco (trigger BEFORE INSERT/UPDATE)
CREATE OR REPLACE FUNCTION public.validate_site_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  url_re constant text := '^https://[A-Za-z0-9._~%-]+(:[0-9]+)?(/.*)?$';
BEGIN
  NEW.site_name := btrim(coalesce(NEW.site_name,''));
  IF NEW.site_name = '' THEN
    RAISE EXCEPTION 'site_name_required' USING ERRCODE='22023';
  END IF;

  NEW.instagram_handle := regexp_replace(btrim(coalesce(NEW.instagram_handle,'')), '^@', '');
  IF NEW.instagram_handle <> '' AND NEW.instagram_handle !~ '^[A-Za-z0-9._]{1,30}$' THEN
    RAISE EXCEPTION 'instagram_handle_invalid' USING ERRCODE='22023';
  END IF;

  NEW.contact_email := btrim(coalesce(NEW.contact_email,''));
  IF NEW.contact_email <> '' AND NEW.contact_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'contact_email_invalid' USING ERRCODE='22023';
  END IF;

  NEW.instagram_url := btrim(coalesce(NEW.instagram_url,''));
  IF NEW.instagram_url <> '' AND NEW.instagram_url !~ url_re THEN
    RAISE EXCEPTION 'instagram_url_invalid' USING ERRCODE='22023';
  END IF;
  NEW.facebook_url := btrim(coalesce(NEW.facebook_url,''));
  IF NEW.facebook_url <> '' AND NEW.facebook_url !~ url_re THEN
    RAISE EXCEPTION 'facebook_url_invalid' USING ERRCODE='22023';
  END IF;
  NEW.threads_url := btrim(coalesce(NEW.threads_url,''));
  IF NEW.threads_url <> '' AND NEW.threads_url !~ url_re THEN
    RAISE EXCEPTION 'threads_url_invalid' USING ERRCODE='22023';
  END IF;
  NEW.whatsapp_url := btrim(coalesce(NEW.whatsapp_url,''));
  IF NEW.whatsapp_url <> '' AND NEW.whatsapp_url !~ url_re THEN
    RAISE EXCEPTION 'whatsapp_url_invalid' USING ERRCODE='22023';
  END IF;
  NEW.youtube_url := btrim(coalesce(NEW.youtube_url,''));
  IF NEW.youtube_url <> '' AND NEW.youtube_url !~ url_re THEN
    RAISE EXCEPTION 'youtube_url_invalid' USING ERRCODE='22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_settings_validate ON public.site_settings;
CREATE TRIGGER site_settings_validate
  BEFORE INSERT OR UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_site_settings();

-- 3) API pública mínima: somente campos públicos
CREATE OR REPLACE FUNCTION public.get_public_site_settings()
RETURNS TABLE (
  site_name text,
  instagram_handle text,
  instagram_url text,
  facebook_url text,
  threads_url text,
  whatsapp_url text,
  youtube_url text,
  contact_email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT site_name, instagram_handle, instagram_url, facebook_url,
         threads_url, whatsapp_url, youtube_url, contact_email
  FROM public.site_settings
  WHERE id = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_site_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_site_settings() TO anon, authenticated;
