-- F3C.1 hotfix parte 2: RPCs administrativas + lockdown do helper

-- ---------- helper de validação ----------
CREATE OR REPLACE FUNCTION public._validate_allowed_hostname(_hostname text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  h text := public.normalize_hostname(_hostname);
BEGIN
  IF h IS NULL OR length(h) = 0 THEN
    RAISE EXCEPTION 'hostname_empty' USING ERRCODE = '22023';
  END IF;
  IF length(h) NOT BETWEEN 3 AND 253 THEN
    RAISE EXCEPTION 'hostname_invalid_length' USING ERRCODE = '22023';
  END IF;
  IF h ~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' THEN
    RAISE EXCEPTION 'hostname_ipv4_literal' USING ERRCODE = '22023';
  END IF;
  IF h ~ ':' THEN
    RAISE EXCEPTION 'hostname_ipv6_or_port' USING ERRCODE = '22023';
  END IF;
  IF h = 'localhost' THEN
    RAISE EXCEPTION 'hostname_localhost' USING ERRCODE = '22023';
  END IF;
  IF h ~ '\.(local|internal|home|lan)$' THEN
    RAISE EXCEPTION 'hostname_reserved_tld' USING ERRCODE = '22023';
  END IF;
  IF h ~ '[\s/?#@*]' OR h LIKE '%*%' THEN
    RAISE EXCEPTION 'hostname_invalid_chars' USING ERRCODE = '22023';
  END IF;
  IF h !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' THEN
    RAISE EXCEPTION 'hostname_invalid_shape' USING ERRCODE = '22023';
  END IF;
  RETURN h;
END;
$$;

REVOKE ALL ON FUNCTION public._validate_allowed_hostname(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._validate_allowed_hostname(text) TO authenticated, service_role;

-- ---------- RPC: upsert ----------
CREATE OR REPLACE FUNCTION public.admin_upsert_source_allowed_host(
  _source_id uuid,
  _hostname text,
  _purpose text,
  _allow_subdomains boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  h   text;
  out_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(uid, 'admin'::public.app_role) OR public.is_main_admin(uid)) THEN
    RAISE EXCEPTION 'forbidden_admin_only' USING ERRCODE = '42501';
  END IF;
  IF _purpose NOT IN ('feed','article','media') THEN
    RAISE EXCEPTION 'invalid_purpose' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.news_sources WHERE id = _source_id) THEN
    RAISE EXCEPTION 'source_not_found' USING ERRCODE = 'P0002';
  END IF;

  h := public._validate_allowed_hostname(_hostname);

  INSERT INTO public.news_source_allowed_hosts
    (source_id, hostname, purpose, allow_subdomains, created_by)
  VALUES
    (_source_id, h, _purpose, COALESCE(_allow_subdomains, false), uid)
  ON CONFLICT (source_id, hostname, purpose) DO UPDATE
    SET allow_subdomains = EXCLUDED.allow_subdomains
  RETURNING id INTO out_id;

  RETURN out_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_source_allowed_host(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_source_allowed_host(uuid, text, text, boolean) TO authenticated, service_role;

-- ---------- RPC: delete ----------
CREATE OR REPLACE FUNCTION public.admin_delete_source_allowed_host(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(uid, 'admin'::public.app_role) OR public.is_main_admin(uid)) THEN
    RAISE EXCEPTION 'forbidden_admin_only' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.news_source_allowed_hosts WHERE id = _id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_source_allowed_host(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_source_allowed_host(uuid) TO authenticated, service_role;

-- ---------- normalize_hostname: restringir superfície ----------
REVOKE ALL ON FUNCTION public.normalize_hostname(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_hostname(text) TO authenticated, service_role;
