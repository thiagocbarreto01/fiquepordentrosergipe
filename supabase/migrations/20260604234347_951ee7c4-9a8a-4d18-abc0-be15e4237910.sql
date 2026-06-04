ALTER EXTENSION pg_trgm SET SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.find_duplicate_post(
  _title text,
  _slug text DEFAULT NULL::text,
  _source_url text DEFAULT NULL::text,
  _exclude_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(id uuid, title text, slug text, source_url text, status public.post_status, match_reason text, similarity real)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $$
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
           extensions.similarity(p.title, _title)::REAL,
           3
    FROM public.posts p
    WHERE _title IS NOT NULL AND char_length(_title) >= 5
      AND extensions.similarity(p.title, _title) >= 0.7
      AND (_exclude_id IS NULL OR p.id <> _exclude_id)
  ) matches
  ORDER BY priority, similarity DESC
  LIMIT 5;
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_post_views(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_post_views(uuid) TO anon, service_role;

DROP POLICY IF EXISTS "public read published safe posts" ON public.posts_public;
CREATE POLICY "public read published safe posts"
ON public.posts_public
FOR SELECT
TO anon, authenticated
USING (status IN ('publicada'::public.post_status, 'publicado'::public.post_status));