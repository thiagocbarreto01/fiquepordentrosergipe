-- ============================================================
-- 1) DELETE em posts: somente admin/super_admin
-- ============================================================
DROP POLICY IF EXISTS "editor or admin deletes" ON public.posts;

CREATE POLICY "admin deletes only"
  ON public.posts
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============================================================
-- 2) Regra SQL única para o arquivamento automático
--    Função interna: retorna IDs candidatos para um horário
--    de referência específico. Nenhum papel pode executar
--    diretamente — apenas as RPCs SECURITY DEFINER abaixo.
-- ============================================================
CREATE OR REPLACE FUNCTION public._auto_archive_candidates(_reference_time timestamptz)
RETURNS TABLE(id uuid, title text, status text, updated_at timestamptz, rule text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.title, p.status::text, p.updated_at,
    CASE
      WHEN p.status IN ('captada','rascunho')     AND p.updated_at < _reference_time - interval '30 days' THEN 'captada_30d'
      WHEN p.status = 'duplicada'                  AND p.updated_at < _reference_time - interval '15 days' THEN 'duplicada_15d'
      WHEN p.status = 'rejeitada'                  AND p.updated_at < _reference_time - interval '15 days' THEN 'rejeitada_15d'
      WHEN p.status IN ('em_revisao','revisao')    AND p.updated_at < _reference_time - interval '60 days' THEN 'em_revisao_60d'
    END AS rule
    FROM public.posts p
   WHERE COALESCE(p.is_evergreen,false) = false
     AND COALESCE(p.is_urgent,false)    = false
     AND (
          (p.status IN ('captada','rascunho')     AND p.updated_at < _reference_time - interval '30 days')
       OR (p.status = 'duplicada'                  AND p.updated_at < _reference_time - interval '15 days')
       OR (p.status = 'rejeitada'                  AND p.updated_at < _reference_time - interval '15 days')
       OR (p.status IN ('em_revisao','revisao')    AND p.updated_at < _reference_time - interval '60 days')
     );
$$;

REVOKE ALL ON FUNCTION public._auto_archive_candidates(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._auto_archive_candidates(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public._auto_archive_candidates(timestamptz) FROM authenticated;
-- Somente o owner (postgres) executa; RPCs SECURITY DEFINER abaixo herdam esse privilégio.

-- ============================================================
-- 3) Prévia — chama a função compartilhada
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_archive_preview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref timestamptz := now();
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

  SELECT
    count(*) FILTER (WHERE rule = 'captada_30d'),
    count(*) FILTER (WHERE rule = 'duplicada_15d'),
    count(*) FILTER (WHERE rule = 'rejeitada_15d'),
    count(*) FILTER (WHERE rule = 'em_revisao_60d'),
    count(*)
  INTO n_captada, n_duplicada, n_rejeitada, n_em_revisao, total
  FROM public._auto_archive_candidates(ref);

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.updated_at ASC), '[]'::jsonb)
    INTO sample
  FROM (
    SELECT id, title, status, updated_at
      FROM public._auto_archive_candidates(ref)
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
    'generated_at', ref,
    'reference_tz', 'America/Maceio'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.auto_archive_preview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_archive_preview() FROM anon;
GRANT  EXECUTE ON FUNCTION public.auto_archive_preview() TO authenticated;

-- ============================================================
-- 4) Execução — arquiva APENAS os IDs devolvidos pela função
--    compartilhada, sem repetir os critérios inline.
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_archive_posts()
RETURNS TABLE(archived_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref timestamptz := now();
  n int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_approve_publish(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH cand AS (
    SELECT id, rule FROM public._auto_archive_candidates(ref)
  ),
  upd AS (
    UPDATE public.posts p
       SET previous_status = p.status,
           status = 'arquivada',
           archived_at = ref,
           archived_reason = 'auto:' || c.rule
      FROM cand c
     WHERE p.id = c.id
     RETURNING 1
  )
  SELECT count(*) INTO n FROM upd;

  archived_count := n;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_archive_posts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_archive_posts() FROM anon;
GRANT  EXECUTE ON FUNCTION public.auto_archive_posts() TO authenticated;