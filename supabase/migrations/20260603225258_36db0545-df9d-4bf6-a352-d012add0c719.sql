BEGIN;

DROP POLICY IF EXISTS "profiles_admin_select_all" ON public.profiles;
CREATE POLICY "profiles_admin_select_all"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all"
  ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.protect_profile_role_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  NEW.role := OLD.role;
  NEW.status := OLD.status;
  NEW.approved_at := OLD.approved_at;
  NEW.approved_by := OLD.approved_by;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::public.app_role, 'editor'::public.app_role, 'redator'::public.app_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_approve_publish(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'editor'::public.app_role)
      OR public.has_role(_user_id, 'admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.archive_post(_post_id uuid, _reason text DEFAULT 'manual'::text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  cur public.post_status;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT status INTO cur FROM public.posts WHERE id = _post_id;
  IF cur IS NULL OR cur = 'arquivada' THEN RETURN; END IF;

  UPDATE public.posts
     SET previous_status = status,
         status = 'arquivada',
         archived_at = now(),
         archived_reason = _reason
   WHERE id = _post_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_post(_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  prev public.post_status;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT previous_status INTO prev FROM public.posts WHERE id = _post_id;

  UPDATE public.posts
     SET status = COALESCE(prev, 'em_revisao'::public.post_status),
         archived_at = NULL,
         archived_reason = NULL,
         previous_status = NULL
   WHERE id = _post_id
     AND status = 'arquivada';
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_archive_posts()
RETURNS TABLE(archived_count integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  total integer := 0;
  c integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_approve_publish(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH upd AS (
    UPDATE public.posts
       SET previous_status = status,
           status = 'arquivada',
           archived_at = now(),
           archived_reason = 'auto:captada_30d'
     WHERE status IN ('captada','rascunho')
       AND updated_at < now() - interval '30 days'
       AND COALESCE(is_evergreen,false) = false
       AND COALESCE(is_urgent,false) = false
     RETURNING 1
  ) SELECT count(*) INTO c FROM upd; total := total + COALESCE(c,0);

  WITH upd AS (
    UPDATE public.posts
       SET previous_status = status,
           status = 'arquivada',
           archived_at = now(),
           archived_reason = 'auto:duplicada_15d'
     WHERE status = 'duplicada'
       AND updated_at < now() - interval '15 days'
       AND COALESCE(is_evergreen,false) = false
       AND COALESCE(is_urgent,false) = false
     RETURNING 1
  ) SELECT count(*) INTO c FROM upd; total := total + COALESCE(c,0);

  WITH upd AS (
    UPDATE public.posts
       SET previous_status = status,
           status = 'arquivada',
           archived_at = now(),
           archived_reason = 'auto:rejeitada_15d'
     WHERE status = 'rejeitada'
       AND updated_at < now() - interval '15 days'
       AND COALESCE(is_evergreen,false) = false
       AND COALESCE(is_urgent,false) = false
     RETURNING 1
  ) SELECT count(*) INTO c FROM upd; total := total + COALESCE(c,0);

  WITH upd AS (
    UPDATE public.posts
       SET previous_status = status,
           status = 'arquivada',
           archived_at = now(),
           archived_reason = 'auto:em_revisao_60d'
     WHERE status IN ('em_revisao','revisao')
       AND updated_at < now() - interval '60 days'
       AND COALESCE(is_evergreen,false) = false
       AND COALESCE(is_urgent,false) = false
     RETURNING 1
  ) SELECT count(*) INTO c FROM upd; total := total + COALESCE(c,0);

  RETURN QUERY SELECT total;
END;
$function$;

CREATE OR REPLACE FUNCTION public.find_duplicate_post(_title text, _slug text DEFAULT NULL::text, _source_url text DEFAULT NULL::text, _exclude_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(id uuid, title text, slug text, source_url text, status public.post_status, match_reason text, similarity real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT id, title, slug, source_url, status, match_reason, similarity
  FROM (
    SELECT p.id, p.title, p.slug, p.source_url, p.status,
           'slug_exato'::TEXT AS match_reason,
           1.0::REAL AS similarity,
           1 AS priority
    FROM public.posts p
    WHERE _slug IS NOT NULL AND p.slug = _slug
      AND (_exclude_id IS NULL OR p.id <> _exclude_id)

    UNION ALL

    SELECT p.id, p.title, p.slug, p.source_url, p.status,
           'fonte_igual'::TEXT,
           1.0::REAL,
           2
    FROM public.posts p
    WHERE _source_url IS NOT NULL AND _source_url <> ''
      AND p.source_url = _source_url
      AND (_exclude_id IS NULL OR p.id <> _exclude_id)

    UNION ALL

    SELECT p.id, p.title, p.slug, p.source_url, p.status,
           'titulo_semelhante'::TEXT,
           public.similarity(p.title, _title)::REAL,
           3
    FROM public.posts p
    WHERE _title IS NOT NULL AND char_length(_title) >= 5
      AND public.similarity(p.title, _title) >= 0.7
      AND (_exclude_id IS NULL OR p.id <> _exclude_id)
  ) matches
  ORDER BY priority, similarity DESC
  LIMIT 5;
$function$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_main_admin(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.archive_post(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_archive_posts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_approve_publish(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_duplicate_post(text, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_post(uuid) TO authenticated;

COMMIT;