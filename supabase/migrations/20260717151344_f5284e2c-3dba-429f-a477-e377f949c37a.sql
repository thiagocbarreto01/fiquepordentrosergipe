
-- 1) Recriar helper interno: sem filtro is_active (garante 13 fontes) + comentário explícito
CREATE OR REPLACE FUNCTION public._collect_allowed_host_candidates()
 RETURNS TABLE(source_id uuid, hostname text, purpose text, occurrences bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Coleta hosts candidatos para a allowlist.
  -- IMPORTANTE: NÃO filtrar por news_sources.is_active — fontes inativas
  -- podem ser capturadas manualmente e precisam de host feed cadastrado
  -- para funcionar quando a allowlist for aplicada.
  WITH raw AS (
    SELECT s.id AS source_id, 'feed'::text AS purpose,
           public.normalize_hostname(split_part(split_part(s.url, '://', 2), '/', 1)) AS hostname,
           1::bigint AS occurrences
      FROM public.news_sources s
     WHERE s.url IS NOT NULL AND s.url <> ''
    UNION ALL
    SELECT p.source_id, 'article'::text,
           public.normalize_hostname(split_part(split_part(p.source_url, '://', 2), '/', 1)),
           count(*)::bigint
      FROM public.posts p
     WHERE p.source_url IS NOT NULL AND p.source_url <> '' AND p.source_id IS NOT NULL
     GROUP BY p.source_id, public.normalize_hostname(split_part(split_part(p.source_url, '://', 2), '/', 1))
    UNION ALL
    SELECT p.source_id, 'media'::text,
           public.normalize_hostname(split_part(split_part(p.cover_image_url, '://', 2), '/', 1)),
           count(*)::bigint
      FROM public.posts p
     WHERE p.cover_image_url ILIKE 'http%' AND p.source_id IS NOT NULL
     GROUP BY p.source_id, public.normalize_hostname(split_part(split_part(p.cover_image_url, '://', 2), '/', 1))
    UNION ALL
    SELECT p.source_id, 'media'::text,
           public.normalize_hostname(split_part(split_part(p.cover_image_original, '://', 2), '/', 1)),
           count(*)::bigint
      FROM public.posts p
     WHERE p.cover_image_original ILIKE 'http%' AND p.source_id IS NOT NULL
     GROUP BY p.source_id, public.normalize_hostname(split_part(split_part(p.cover_image_original, '://', 2), '/', 1))
  )
  SELECT source_id, hostname, purpose, sum(occurrences)::bigint
    FROM raw
   WHERE hostname IS NOT NULL AND hostname <> ''
   GROUP BY source_id, hostname, purpose;
$function$;

-- 2) Fechar o helper: sem EXECUTE para PUBLIC / anon / authenticated
REVOKE ALL ON FUNCTION public._collect_allowed_host_candidates() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._collect_allowed_host_candidates() FROM anon;
REVOKE ALL ON FUNCTION public._collect_allowed_host_candidates() FROM authenticated;
GRANT EXECUTE ON FUNCTION public._collect_allowed_host_candidates() TO service_role;

COMMENT ON FUNCTION public._collect_allowed_host_candidates() IS
  'Helper INTERNO usado por admin_backfill_source_allowed_hosts. Não chamável pelo frontend/PostgREST. SECURITY DEFINER executa como owner, então as RPCs admin conseguem invocá-la mesmo sem GRANT para authenticated.';
