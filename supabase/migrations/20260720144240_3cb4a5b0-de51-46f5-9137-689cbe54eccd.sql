
CREATE OR REPLACE FUNCTION public.verify_site_rebuild_cron_token(_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_stored text;
BEGIN
  IF _token IS NULL OR length(_token) < 16 OR length(_token) > 512 THEN
    RETURN false;
  END IF;
  SELECT decrypted_secret INTO v_stored
  FROM vault.decrypted_secrets
  WHERE name = 'seo_rebuild_cron_token' LIMIT 1;
  IF v_stored IS NULL THEN RETURN false; END IF;
  RETURN encode(extensions.digest(_token, 'sha256'), 'hex')
       = encode(extensions.digest(v_stored, 'sha256'), 'hex');
END;
$$;
REVOKE ALL ON FUNCTION public.verify_site_rebuild_cron_token(text) FROM PUBLIC, anon, authenticated;
