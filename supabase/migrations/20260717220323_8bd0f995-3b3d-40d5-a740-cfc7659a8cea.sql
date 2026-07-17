
-- 1) Helper de papel: editor ou admin (exclui redator)
CREATE OR REPLACE FUNCTION public.is_editor_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::public.app_role, 'editor'::public.app_role)
  );
$$;

REVOKE ALL ON FUNCTION public.is_editor_or_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_editor_or_admin(uuid) TO authenticated, service_role;

-- 2) Endurecer ACL das RPCs de Auto Sync (revoga PUBLIC/anon, concede apenas authenticated+service_role)
REVOKE ALL ON FUNCTION public.audit_posts_public_drift()  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.preview_posts_public_drift(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auto_repair_posts_public()  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resync_posts_public()       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recluster_all_posts_local(boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.audit_posts_public_drift()  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_posts_public_drift(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_repair_posts_public()  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resync_posts_public()       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recluster_all_posts_local(boolean) TO authenticated, service_role;

-- 3) preview_posts_public_drift: checagem explícita editor/admin
CREATE OR REPLACE FUNCTION public.preview_posts_public_drift(_sample_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _missing int;
  _stale int;
  _missing_sample jsonb;
  _stale_sample jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_editor_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(*)::int INTO _missing
  FROM public.posts p
  WHERE p.status = 'publicada'::public.post_status
    AND (p.published_at IS NULL OR p.published_at <= now())
    AND NOT EXISTS (SELECT 1 FROM public.posts_public pp WHERE pp.id = p.id);

  SELECT count(*)::int INTO _stale
  FROM public.posts_public pp
  WHERE NOT EXISTS (
    SELECT 1 FROM public.posts p
     WHERE p.id = pp.id
       AND p.status = 'publicada'::public.post_status
       AND (p.published_at IS NULL OR p.published_at <= now())
  );

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'title', title) ORDER BY published_at DESC NULLS LAST), '[]'::jsonb)
    INTO _missing_sample
  FROM (
    SELECT p.id, p.title, p.published_at
      FROM public.posts p
     WHERE p.status = 'publicada'::public.post_status
       AND (p.published_at IS NULL OR p.published_at <= now())
       AND NOT EXISTS (SELECT 1 FROM public.posts_public pp WHERE pp.id = p.id)
     ORDER BY p.published_at DESC NULLS LAST
     LIMIT GREATEST(_sample_limit, 1)
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'title', title)), '[]'::jsonb)
    INTO _stale_sample
  FROM (
    SELECT pp.id, pp.title
      FROM public.posts_public pp
     WHERE NOT EXISTS (
       SELECT 1 FROM public.posts p
        WHERE p.id = pp.id
          AND p.status = 'publicada'::public.post_status
          AND (p.published_at IS NULL OR p.published_at <= now())
     )
     LIMIT GREATEST(_sample_limit, 1)
  ) s;

  RETURN jsonb_build_object(
    'missing_in_public', _missing,
    'stale_in_public', _stale,
    'total_divergent', _missing + _stale,
    'checked_at', now(),
    'missing_sample', _missing_sample,
    'stale_sample', _stale_sample
  );
END;
$function$;

-- 4) resync_posts_public: editor/admin + advisory lock
CREATE OR REPLACE FUNCTION public.resync_posts_public()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  affected integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_editor_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('auto_sync.resync_posts_public')) THEN
    RAISE EXCEPTION 'already_running' USING ERRCODE = '55P03';
  END IF;

  DELETE FROM public.posts_public pp
   WHERE NOT EXISTS (
     SELECT 1 FROM public.posts p
      WHERE p.id = pp.id
        AND p.status = 'publicada'::public.post_status
        AND (p.published_at IS NULL OR p.published_at <= now())
   );

  WITH upserted AS (
    INSERT INTO public.posts_public (
      id, title, subtitle, slug, content, excerpt, cover_image_url, category_id, author_id,
      tags, is_featured, is_main_featured, is_urgent, is_denuncia, meta_title, meta_description,
      views, published_at, created_at, updated_at, status, video_url_principal, videos_relacionados,
      manual_image_url, home_expires_at, is_evergreen, main_featured_expires_at, is_editorial,
      image_caption, image_credit
    )
    SELECT
      p.id, p.title, p.subtitle, p.slug, p.content, p.excerpt, p.cover_image_url, p.category_id, p.author_id,
      COALESCE(p.tags,'{}'::text[]), p.is_featured, p.is_main_featured, p.is_urgent, p.is_denuncia, p.meta_title, p.meta_description,
      p.views, COALESCE(p.published_at, now()), p.created_at, p.updated_at, p.status, p.video_url_principal, COALESCE(p.videos_relacionados,'{}'::text[]),
      p.manual_image_url, p.home_expires_at, p.is_evergreen, p.main_featured_expires_at, (p.source_id IS NULL),
      p.image_caption, p.image_credit
    FROM public.posts p
    WHERE p.status = 'publicada'::public.post_status
      AND (p.published_at IS NULL OR p.published_at <= now())
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      subtitle = EXCLUDED.subtitle,
      slug = EXCLUDED.slug,
      content = EXCLUDED.content,
      excerpt = EXCLUDED.excerpt,
      cover_image_url = EXCLUDED.cover_image_url,
      category_id = EXCLUDED.category_id,
      author_id = EXCLUDED.author_id,
      tags = EXCLUDED.tags,
      is_featured = EXCLUDED.is_featured,
      is_main_featured = EXCLUDED.is_main_featured,
      is_urgent = EXCLUDED.is_urgent,
      is_denuncia = EXCLUDED.is_denuncia,
      meta_title = EXCLUDED.meta_title,
      meta_description = EXCLUDED.meta_description,
      views = EXCLUDED.views,
      published_at = EXCLUDED.published_at,
      updated_at = EXCLUDED.updated_at,
      status = EXCLUDED.status,
      video_url_principal = EXCLUDED.video_url_principal,
      videos_relacionados = EXCLUDED.videos_relacionados,
      manual_image_url = EXCLUDED.manual_image_url,
      home_expires_at = EXCLUDED.home_expires_at,
      is_evergreen = EXCLUDED.is_evergreen,
      main_featured_expires_at = EXCLUDED.main_featured_expires_at,
      is_editorial = EXCLUDED.is_editorial,
      image_caption = EXCLUDED.image_caption,
      image_credit = EXCLUDED.image_credit
    RETURNING 1
  )
  SELECT count(*) INTO affected FROM upserted;

  RETURN affected;
END;
$function$;

-- 5) auto_repair_posts_public: editor/admin
CREATE OR REPLACE FUNCTION public.auto_repair_posts_public()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  fixed int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_editor_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  fixed := public.resync_posts_public();

  INSERT INTO public.sync_audit_log (event_type, status, details)
  VALUES ('auto_repair', 'ok', jsonb_build_object('rows', fixed));

  RETURN fixed;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.sync_audit_log (event_type, status, error)
  VALUES ('auto_repair', 'error', SQLERRM);
  RAISE;
END;
$function$;

-- 6) audit_posts_public_drift: editor/admin (chamada pelo painel e watchdog)
CREATE OR REPLACE FUNCTION public.audit_posts_public_drift()
RETURNS TABLE(missing_in_public integer, stale_in_public integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_editor_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*)::int FROM public.posts p
       WHERE p.status = 'publicada'::public.post_status
         AND (p.published_at IS NULL OR p.published_at <= now())
         AND NOT EXISTS (SELECT 1 FROM public.posts_public pp WHERE pp.id = p.id)),
    (SELECT count(*)::int FROM public.posts_public pp
       WHERE NOT EXISTS (
         SELECT 1 FROM public.posts p
          WHERE p.id = pp.id
            AND p.status = 'publicada'::public.post_status
       ));
END;
$function$;

-- 7) recluster_all_posts_local: editor/admin + advisory lock + guarda anti-duplicidade
CREATE OR REPLACE FUNCTION public.recluster_all_posts_local(_force boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  r RECORD;
  n int := 0;
  processed uuid[] := ARRAY[]::uuid[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_editor_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('auto_sync.recluster_all_posts_local')) THEN
    RAISE EXCEPTION 'already_running' USING ERRCODE = '55P03';
  END IF;

  IF _force THEN
    UPDATE public.posts        SET event_id = NULL;
    UPDATE public.posts_public SET event_id = NULL;
    DELETE FROM public.news_events;
  END IF;

  FOR r IN
    SELECT DISTINCT id FROM public.posts
     WHERE status = 'publicada'::public.post_status
       AND (_force OR event_id IS NULL)
     ORDER BY id
  LOOP
    IF r.id = ANY(processed) THEN CONTINUE; END IF;
    processed := processed || r.id;
    BEGIN
      PERFORM public.cluster_post_into_event(r.id);
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'recluster local falhou para %: %', r.id, SQLERRM;
    END;
  END LOOP;

  INSERT INTO public.sync_audit_log (event_type, status, details)
  VALUES ('recluster_local', 'ok', jsonb_build_object('processed', n, 'force', _force));

  RETURN n;
END;
$function$;
