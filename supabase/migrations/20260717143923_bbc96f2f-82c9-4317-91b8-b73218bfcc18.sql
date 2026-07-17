
-- ============================================================
-- Fontes F3C.1 — Allowlist infrastructure (no enforcement yet)
-- ============================================================

-- Normalize hostname (immutable, safe for expressions/indexes)
CREATE OR REPLACE FUNCTION public.normalize_hostname(_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _input IS NULL THEN NULL
    ELSE regexp_replace(
           regexp_replace(
             btrim(lower(_input)),
             '\.$', ''     -- trailing dot
           ),
           '^www\.', ''    -- canonical: strip leading www.
         )
  END
$$;

-- ============================================================
-- Table
-- ============================================================
CREATE TABLE public.news_source_allowed_hosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.news_sources(id) ON DELETE CASCADE,
  hostname text NOT NULL,
  purpose text NOT NULL,
  allow_subdomains boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,

  CONSTRAINT nsah_purpose_chk CHECK (purpose IN ('feed','article','media')),

  -- Basic syntactic rules (immutable regex only)
  CONSTRAINT nsah_hostname_not_empty CHECK (length(btrim(hostname)) > 0),
  CONSTRAINT nsah_hostname_len CHECK (length(hostname) BETWEEN 3 AND 253),
  CONSTRAINT nsah_hostname_lowercase CHECK (hostname = lower(hostname)),
  CONSTRAINT nsah_hostname_no_special CHECK (hostname !~ '[\s/:?#@*]'),
  CONSTRAINT nsah_hostname_no_www_prefix CHECK (hostname !~ '^www\.'),
  CONSTRAINT nsah_hostname_no_trailing_dot CHECK (hostname !~ '\.$'),
  CONSTRAINT nsah_hostname_shape CHECK (
    hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
  ),
  CONSTRAINT nsah_hostname_not_ipv4 CHECK (
    hostname !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$'
  ),
  CONSTRAINT nsah_hostname_not_ipv6 CHECK (hostname !~ ':'),
  CONSTRAINT nsah_hostname_not_localhost CHECK (hostname <> 'localhost'),
  CONSTRAINT nsah_hostname_not_reserved_tld CHECK (
    hostname !~ '\.(local|internal|home|lan)$'
  ),

  CONSTRAINT nsah_unique_source_host_purpose UNIQUE (source_id, hostname, purpose)
);

CREATE INDEX nsah_source_id_idx ON public.news_source_allowed_hosts(source_id);
CREATE INDEX nsah_hostname_idx  ON public.news_source_allowed_hosts(hostname);

-- ============================================================
-- Grants + RLS (staff-only, no anon, no default authenticated)
-- ============================================================
REVOKE ALL ON public.news_source_allowed_hosts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.news_source_allowed_hosts TO authenticated;
GRANT ALL ON public.news_source_allowed_hosts TO service_role;

ALTER TABLE public.news_source_allowed_hosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read allowed hosts"
  ON public.news_source_allowed_hosts
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "staff insert allowed hosts"
  ON public.news_source_allowed_hosts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "staff update allowed hosts"
  ON public.news_source_allowed_hosts
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "staff delete allowed hosts"
  ON public.news_source_allowed_hosts
  FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

-- ============================================================
-- Preview RPC (read-only). Does not insert anything.
-- Returns the hosts a future backfill would propose, per source,
-- with real occurrence counts and a validity flag.
-- ============================================================
CREATE OR REPLACE FUNCTION public.preview_allowed_hosts_backfill()
RETURNS TABLE (
  source_id uuid,
  source_name text,
  purpose text,
  hostname text,
  occurrences bigint,
  already_allowed boolean,
  is_valid boolean,
  invalid_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH raw AS (
    SELECT s.id AS source_id, s.name AS source_name, 'feed'::text AS purpose,
           public.normalize_hostname(split_part(split_part(s.url, '://', 2), '/', 1)) AS hostname,
           1::bigint AS occurrences
      FROM public.news_sources s
     WHERE s.url IS NOT NULL AND s.url <> ''
    UNION ALL
    SELECT p.source_id, s.name, 'article'::text,
           public.normalize_hostname(split_part(split_part(p.source_url, '://', 2), '/', 1)),
           count(*)::bigint
      FROM public.posts p
      JOIN public.news_sources s ON s.id = p.source_id
     WHERE p.source_url IS NOT NULL AND p.source_url <> ''
     GROUP BY p.source_id, s.name,
              public.normalize_hostname(split_part(split_part(p.source_url, '://', 2), '/', 1))
    UNION ALL
    SELECT p.source_id, s.name, 'media'::text,
           public.normalize_hostname(split_part(split_part(p.cover_image_url, '://', 2), '/', 1)),
           count(*)::bigint
      FROM public.posts p
      JOIN public.news_sources s ON s.id = p.source_id
     WHERE p.cover_image_url ILIKE 'http%'
     GROUP BY p.source_id, s.name,
              public.normalize_hostname(split_part(split_part(p.cover_image_url, '://', 2), '/', 1))
    UNION ALL
    SELECT p.source_id, s.name, 'media'::text,
           public.normalize_hostname(split_part(split_part(p.cover_image_original, '://', 2), '/', 1)),
           count(*)::bigint
      FROM public.posts p
      JOIN public.news_sources s ON s.id = p.source_id
     WHERE p.cover_image_original ILIKE 'http%'
     GROUP BY p.source_id, s.name,
              public.normalize_hostname(split_part(split_part(p.cover_image_original, '://', 2), '/', 1))
  ),
  grouped AS (
    SELECT r.source_id, r.source_name, r.purpose, r.hostname, sum(r.occurrences) AS occurrences
      FROM raw r
     WHERE r.hostname IS NOT NULL AND r.hostname <> ''
     GROUP BY r.source_id, r.source_name, r.purpose, r.hostname
  )
  SELECT
    g.source_id,
    g.source_name,
    g.purpose,
    g.hostname,
    g.occurrences,
    EXISTS (
      SELECT 1 FROM public.news_source_allowed_hosts a
       WHERE a.source_id = g.source_id
         AND a.hostname  = g.hostname
         AND a.purpose   = g.purpose
    ) AS already_allowed,
    CASE
      WHEN g.hostname ~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' THEN false
      WHEN g.hostname = 'localhost' THEN false
      WHEN g.hostname ~ '\.(local|internal|home|lan)$' THEN false
      WHEN g.hostname ~ '[\s/:?#@*]' THEN false
      WHEN g.hostname !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' THEN false
      WHEN length(g.hostname) NOT BETWEEN 3 AND 253 THEN false
      ELSE true
    END AS is_valid,
    CASE
      WHEN g.hostname ~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' THEN 'ipv4_literal'
      WHEN g.hostname = 'localhost' THEN 'localhost'
      WHEN g.hostname ~ '\.(local|internal|home|lan)$' THEN 'reserved_tld'
      WHEN g.hostname ~ '[\s/:?#@*]' THEN 'invalid_chars'
      WHEN g.hostname !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' THEN 'invalid_shape'
      WHEN length(g.hostname) NOT BETWEEN 3 AND 253 THEN 'invalid_length'
      ELSE NULL
    END AS invalid_reason
  FROM grouped g
  ORDER BY g.source_name, g.purpose, g.occurrences DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_allowed_hosts_backfill() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_allowed_hosts_backfill() TO authenticated;
