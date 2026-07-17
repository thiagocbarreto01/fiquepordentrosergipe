
-- 1) Preview do drift com amostra (staff-only)
CREATE OR REPLACE FUNCTION public.preview_posts_public_drift(_sample_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _missing int;
  _stale int;
  _missing_sample jsonb;
  _stale_sample jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN
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
$$;

REVOKE ALL ON FUNCTION public.preview_posts_public_drift(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_posts_public_drift(int) TO authenticated;

-- 2) Recluster local (sem HTTP, sem embeddings) — usa trigram
CREATE OR REPLACE FUNCTION public.recluster_all_posts_local(_force boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  r RECORD;
  n int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _force THEN
    UPDATE public.posts        SET event_id = NULL;
    UPDATE public.posts_public SET event_id = NULL;
    DELETE FROM public.news_events;
  END IF;

  FOR r IN
    SELECT id FROM public.posts
     WHERE status = 'publicada'::public.post_status
       AND (_force OR event_id IS NULL)
     ORDER BY published_at ASC NULLS LAST
  LOOP
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
$$;

REVOKE ALL ON FUNCTION public.recluster_all_posts_local(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recluster_all_posts_local(boolean) TO authenticated;
