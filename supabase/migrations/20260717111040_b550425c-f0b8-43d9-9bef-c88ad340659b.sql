CREATE OR REPLACE FUNCTION public.auto_archive_preview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total int := 0;
  n_captada int := 0;
  n_duplicada int := 0;
  n_rejeitada int := 0;
  n_em_revisao int := 0;
  sample jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_approve_publish(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(*) INTO n_captada FROM public.posts
   WHERE status IN ('captada','rascunho')
     AND updated_at < now() - interval '30 days'
     AND COALESCE(is_evergreen,false) = false
     AND COALESCE(is_urgent,false) = false;

  SELECT count(*) INTO n_duplicada FROM public.posts
   WHERE status = 'duplicada'
     AND updated_at < now() - interval '15 days'
     AND COALESCE(is_evergreen,false) = false
     AND COALESCE(is_urgent,false) = false;

  SELECT count(*) INTO n_rejeitada FROM public.posts
   WHERE status = 'rejeitada'
     AND updated_at < now() - interval '15 days'
     AND COALESCE(is_evergreen,false) = false
     AND COALESCE(is_urgent,false) = false;

  SELECT count(*) INTO n_em_revisao FROM public.posts
   WHERE status IN ('em_revisao','revisao')
     AND updated_at < now() - interval '60 days'
     AND COALESCE(is_evergreen,false) = false
     AND COALESCE(is_urgent,false) = false;

  total := n_captada + n_duplicada + n_rejeitada + n_em_revisao;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.updated_at ASC), '[]'::jsonb)
    INTO sample
  FROM (
    SELECT id, title, status::text AS status, updated_at
      FROM public.posts
     WHERE (
             (status IN ('captada','rascunho')       AND updated_at < now() - interval '30 days')
          OR (status = 'duplicada'                    AND updated_at < now() - interval '15 days')
          OR (status = 'rejeitada'                    AND updated_at < now() - interval '15 days')
          OR (status IN ('em_revisao','revisao')      AND updated_at < now() - interval '60 days')
         )
       AND COALESCE(is_evergreen,false) = false
       AND COALESCE(is_urgent,false) = false
     ORDER BY updated_at ASC
     LIMIT 5
  ) t;

  RETURN jsonb_build_object(
    'total', total,
    'by_rule', jsonb_build_object(
      'captada_30d',    n_captada,
      'duplicada_15d',  n_duplicada,
      'rejeitada_15d',  n_rejeitada,
      'em_revisao_60d', n_em_revisao
    ),
    'sample', sample,
    'generated_at', now(),
    'reference_tz', 'America/Maceio'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.auto_archive_preview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_archive_preview() FROM anon;
GRANT EXECUTE ON FUNCTION public.auto_archive_preview() TO authenticated;