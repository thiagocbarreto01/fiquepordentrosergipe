-- ============================================================
-- 1. Coluna duplicate_of e índices únicos
-- ============================================================
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS duplicate_of UUID REFERENCES public.posts(id) ON DELETE SET NULL;

-- Limpar duplicatas exatas de slug antes de criar índice único (mantém a mais antiga)
WITH dups AS (
  SELECT id, slug,
         ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at) AS rn
  FROM public.posts
)
UPDATE public.posts p
SET slug = p.slug || '-dup-' || substring(p.id::text, 1, 6)
FROM dups
WHERE p.id = dups.id AND dups.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS posts_slug_unique ON public.posts(slug);

-- Índice único parcial em source_url (permite NULLs e vazios)
CREATE UNIQUE INDEX IF NOT EXISTS posts_source_url_unique
  ON public.posts(source_url)
  WHERE source_url IS NOT NULL AND source_url <> '';

-- ============================================================
-- 2. Extensão pg_trgm para similaridade de título
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE INDEX IF NOT EXISTS posts_title_trgm
  ON public.posts USING gin (title public.gin_trgm_ops);

-- ============================================================
-- 3. Função detectora de duplicatas
-- ============================================================
CREATE OR REPLACE FUNCTION public.find_duplicate_post(
  _title TEXT,
  _slug TEXT DEFAULT NULL,
  _source_url TEXT DEFAULT NULL,
  _exclude_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  slug TEXT,
  source_url TEXT,
  status public.post_status,
  match_reason TEXT,
  similarity REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, title, slug, source_url, status, match_reason, similarity
  FROM (
    -- Match por slug exato
    SELECT p.id, p.title, p.slug, p.source_url, p.status,
           'slug_exato'::TEXT AS match_reason,
           1.0::REAL AS similarity,
           1 AS priority
    FROM public.posts p
    WHERE _slug IS NOT NULL AND p.slug = _slug
      AND (_exclude_id IS NULL OR p.id <> _exclude_id)

    UNION ALL

    -- Match por source_url exato
    SELECT p.id, p.title, p.slug, p.source_url, p.status,
           'fonte_igual'::TEXT,
           1.0::REAL,
           2
    FROM public.posts p
    WHERE _source_url IS NOT NULL AND _source_url <> ''
      AND p.source_url = _source_url
      AND (_exclude_id IS NULL OR p.id <> _exclude_id)

    UNION ALL

    -- Match por título semelhante (>= 0.7)
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
$$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_post(TEXT, TEXT, TEXT, UUID) TO authenticated, anon, service_role;