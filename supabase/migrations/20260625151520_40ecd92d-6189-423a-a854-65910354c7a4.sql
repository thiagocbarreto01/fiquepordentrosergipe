
-- =========================
-- 1) Tabela news_events
-- =========================
CREATE TABLE IF NOT EXISTS public.news_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE,
  title text NOT NULL,
  summary text,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  entities text[] NOT NULL DEFAULT '{}',
  keywords text[] NOT NULL DEFAULT '{}',
  impact_score numeric NOT NULL DEFAULT 0,
  is_breaking boolean NOT NULL DEFAULT false,
  breaking_until timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  post_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.news_events TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.news_events TO authenticated;
GRANT ALL ON public.news_events TO service_role;

ALTER TABLE public.news_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "news_events public read" ON public.news_events;
CREATE POLICY "news_events public read"
  ON public.news_events FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "news_events staff write" ON public.news_events;
CREATE POLICY "news_events staff write"
  ON public.news_events FOR ALL
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS news_events_breaking_idx ON public.news_events (is_breaking, impact_score DESC);
CREATE INDEX IF NOT EXISTS news_events_updated_idx ON public.news_events (last_updated_at DESC);

DROP TRIGGER IF EXISTS news_events_set_updated ON public.news_events;
CREATE TRIGGER news_events_set_updated
  BEFORE UPDATE ON public.news_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- 2) Tabela sync_audit_log
-- =========================
CREATE TABLE IF NOT EXISTS public.sync_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  post_id uuid,
  status text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.sync_audit_log TO authenticated;
GRANT ALL ON public.sync_audit_log TO service_role;

ALTER TABLE public.sync_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_audit staff read" ON public.sync_audit_log;
CREATE POLICY "sync_audit staff read"
  ON public.sync_audit_log FOR SELECT
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "sync_audit staff insert" ON public.sync_audit_log;
CREATE POLICY "sync_audit staff insert"
  ON public.sync_audit_log FOR INSERT
  WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS sync_audit_created_idx ON public.sync_audit_log (created_at DESC);

-- =========================
-- 3) Colunas em posts e posts_public
-- =========================
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.news_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_seo_title text,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_clickbait_score numeric,
  ADD COLUMN IF NOT EXISTS ai_suggested_category uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_entities text[] DEFAULT '{}';

ALTER TABLE public.posts_public
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS ai_seo_title text,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_entities text[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS posts_event_idx ON public.posts (event_id);
CREATE INDEX IF NOT EXISTS posts_public_event_idx ON public.posts_public (event_id);

-- =========================
-- 4) Função: clusterização de posts em eventos
-- =========================
CREATE OR REPLACE FUNCTION public.cluster_post_into_event(_post_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  p RECORD;
  match_event uuid;
  new_event uuid;
  base_slug text;
  final_slug text;
  i int := 0;
BEGIN
  SELECT id, title, slug, category_id, tags, COALESCE(ai_entities,'{}'::text[]) AS entities
    INTO p FROM public.posts WHERE id = _post_id;
  IF NOT FOUND OR p.title IS NULL THEN RETURN NULL; END IF;

  -- Try to find an existing event whose title is similar
  SELECT e.id INTO match_event
    FROM public.news_events e
   WHERE e.last_updated_at > now() - interval '72 hours'
     AND extensions.similarity(e.title, p.title) >= 0.45
   ORDER BY extensions.similarity(e.title, p.title) DESC
   LIMIT 1;

  IF match_event IS NOT NULL THEN
    UPDATE public.news_events
       SET last_updated_at = now(),
           post_count = post_count + 1,
           entities = ARRAY(SELECT DISTINCT unnest(entities || p.entities)),
           keywords = ARRAY(SELECT DISTINCT unnest(keywords || COALESCE(p.tags,'{}'::text[])))
     WHERE id = match_event;
    UPDATE public.posts SET event_id = match_event WHERE id = _post_id;
    UPDATE public.posts_public SET event_id = match_event WHERE id = _post_id;
    RETURN match_event;
  END IF;

  -- Create a new event
  base_slug := regexp_replace(lower(coalesce(p.slug, p.title)), '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from substring(base_slug from 1 for 80));
  final_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM public.news_events WHERE slug = final_slug) LOOP
    i := i + 1;
    final_slug := base_slug || '-' || i::text;
  END LOOP;

  INSERT INTO public.news_events (slug, title, category_id, entities, keywords, post_count, last_updated_at)
  VALUES (final_slug, p.title, p.category_id, p.entities, COALESCE(p.tags,'{}'::text[]), 1, now())
  RETURNING id INTO new_event;

  UPDATE public.posts SET event_id = new_event WHERE id = _post_id;
  UPDATE public.posts_public SET event_id = new_event WHERE id = _post_id;
  RETURN new_event;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cluster_post_into_event(uuid) TO authenticated, service_role;

-- =========================
-- 5) Função: detect_breaking_events
-- =========================
CREATE OR REPLACE FUNCTION public.detect_breaking_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected int := 0;
BEGIN
  -- Recalculate impact_score: post_count_recent * 10 + urgent boost
  WITH recent AS (
    SELECT e.id,
           COUNT(p.id) FILTER (WHERE p.published_at > now() - interval '6 hours') AS recent_posts,
           BOOL_OR(COALESCE(p.is_urgent,false)) AS has_urgent,
           MAX(p.views) AS top_views
      FROM public.news_events e
      LEFT JOIN public.posts_public p ON p.event_id = e.id
     GROUP BY e.id
  )
  UPDATE public.news_events e
     SET impact_score = LEAST(100,
           COALESCE(r.recent_posts,0)*15
         + CASE WHEN r.has_urgent THEN 40 ELSE 0 END
         + LEAST(30, COALESCE(r.top_views,0)/50.0)
       )
    FROM recent r
   WHERE r.id = e.id;

  WITH upd AS (
    UPDATE public.news_events
       SET is_breaking = true,
           breaking_until = now() + interval '90 minutes'
     WHERE impact_score >= 70
       AND last_updated_at > now() - interval '2 hours'
       AND (breaking_until IS NULL OR breaking_until < now() + interval '10 minutes')
     RETURNING 1
  ) SELECT count(*) INTO affected FROM upd;

  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_breaking_events() TO authenticated, service_role;

-- =========================
-- 6) Função: expire_breaking_events
-- =========================
CREATE OR REPLACE FUNCTION public.expire_breaking_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  WITH upd AS (
    UPDATE public.news_events
       SET is_breaking = false
     WHERE is_breaking = true
       AND (breaking_until IS NULL OR breaking_until < now())
     RETURNING 1
  ) SELECT count(*) INTO n FROM upd;
  RETURN COALESCE(n,0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_breaking_events() TO anon, authenticated, service_role;

-- =========================
-- 7) Função: audit_posts_public_drift
-- =========================
CREATE OR REPLACE FUNCTION public.audit_posts_public_drift()
RETURNS TABLE(missing_in_public int, stale_in_public int)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.audit_posts_public_drift() TO authenticated, service_role;

-- =========================
-- 8) Função: auto_repair_posts_public
-- =========================
CREATE OR REPLACE FUNCTION public.auto_repair_posts_public()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fixed int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN
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
$$;

GRANT EXECUTE ON FUNCTION public.auto_repair_posts_public() TO authenticated, service_role;

-- =========================
-- 9) Função: get_event_related_posts
-- =========================
CREATE OR REPLACE FUNCTION public.get_event_related_posts(_post_id uuid, _limit int DEFAULT 5)
RETURNS TABLE(id uuid, title text, slug text, cover_image_url text, published_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pp.id, pp.title, pp.slug, pp.cover_image_url, pp.published_at
    FROM public.posts_public pp
   WHERE pp.event_id = (SELECT event_id FROM public.posts_public WHERE id = _post_id)
     AND pp.id <> _post_id
     AND pp.event_id IS NOT NULL
   ORDER BY pp.published_at DESC
   LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_related_posts(uuid, int) TO anon, authenticated, service_role;

-- =========================
-- 10) Trigger de clusterização ao publicar
-- =========================
CREATE OR REPLACE FUNCTION public.trg_cluster_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'publicada'::public.post_status AND NEW.event_id IS NULL THEN
    BEGIN
      PERFORM public.cluster_post_into_event(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'cluster_post_into_event falhou: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_cluster_on_publish ON public.posts;
CREATE TRIGGER posts_cluster_on_publish
  AFTER INSERT OR UPDATE OF status ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_cluster_post();

-- =========================
-- 11) Atualizar sync_posts_public para incluir novos campos
-- =========================
CREATE OR REPLACE FUNCTION public.sync_posts_public()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.posts_public WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  BEGIN
    IF NEW.status = 'publicada'::public.post_status
       AND (NEW.published_at IS NULL OR NEW.published_at <= now()) THEN
      INSERT INTO public.posts_public (
        id, title, subtitle, slug, content, excerpt, cover_image_url, category_id, author_id,
        tags, is_featured, is_main_featured, is_urgent, is_denuncia, meta_title, meta_description,
        views, published_at, created_at, updated_at, status, video_url_principal, videos_relacionados,
        manual_image_url, home_expires_at, is_evergreen, main_featured_expires_at, is_editorial,
        event_id, ai_seo_title, ai_summary, ai_entities
      ) VALUES (
        NEW.id, NEW.title, NEW.subtitle, NEW.slug, NEW.content, NEW.excerpt, NEW.cover_image_url, NEW.category_id, NEW.author_id,
        COALESCE(NEW.tags, '{}'::text[]), NEW.is_featured, NEW.is_main_featured, NEW.is_urgent, NEW.is_denuncia, NEW.meta_title, NEW.meta_description,
        NEW.views, COALESCE(NEW.published_at, now()), NEW.created_at, NEW.updated_at, NEW.status, NEW.video_url_principal, COALESCE(NEW.videos_relacionados, '{}'::text[]),
        NEW.manual_image_url, NEW.home_expires_at, NEW.is_evergreen, NEW.main_featured_expires_at, (NEW.source_id IS NULL),
        NEW.event_id, NEW.ai_seo_title, NEW.ai_summary, COALESCE(NEW.ai_entities,'{}'::text[])
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, slug = EXCLUDED.slug,
        content = EXCLUDED.content, excerpt = EXCLUDED.excerpt, cover_image_url = EXCLUDED.cover_image_url,
        category_id = EXCLUDED.category_id, author_id = EXCLUDED.author_id, tags = EXCLUDED.tags,
        is_featured = EXCLUDED.is_featured, is_main_featured = EXCLUDED.is_main_featured,
        is_urgent = EXCLUDED.is_urgent, is_denuncia = EXCLUDED.is_denuncia,
        meta_title = EXCLUDED.meta_title, meta_description = EXCLUDED.meta_description,
        views = EXCLUDED.views, published_at = EXCLUDED.published_at,
        created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, status = EXCLUDED.status,
        video_url_principal = EXCLUDED.video_url_principal, videos_relacionados = EXCLUDED.videos_relacionados,
        manual_image_url = EXCLUDED.manual_image_url, home_expires_at = EXCLUDED.home_expires_at,
        is_evergreen = EXCLUDED.is_evergreen, main_featured_expires_at = EXCLUDED.main_featured_expires_at,
        is_editorial = EXCLUDED.is_editorial,
        event_id = EXCLUDED.event_id, ai_seo_title = EXCLUDED.ai_seo_title,
        ai_summary = EXCLUDED.ai_summary, ai_entities = EXCLUDED.ai_entities;
    ELSE
      DELETE FROM public.posts_public WHERE id = NEW.id;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    DELETE FROM public.posts_public WHERE slug = NEW.slug AND id <> NEW.id;
    INSERT INTO public.posts_public (
      id, title, subtitle, slug, content, excerpt, cover_image_url, category_id, author_id,
      tags, is_featured, is_main_featured, is_urgent, is_denuncia, meta_title, meta_description,
      views, published_at, created_at, updated_at, status, video_url_principal, videos_relacionados,
      manual_image_url, home_expires_at, is_evergreen, main_featured_expires_at, is_editorial,
      event_id, ai_seo_title, ai_summary, ai_entities
    ) VALUES (
      NEW.id, NEW.title, NEW.subtitle, NEW.slug, NEW.content, NEW.excerpt, NEW.cover_image_url, NEW.category_id, NEW.author_id,
      COALESCE(NEW.tags, '{}'::text[]), NEW.is_featured, NEW.is_main_featured, NEW.is_urgent, NEW.is_denuncia, NEW.meta_title, NEW.meta_description,
      NEW.views, COALESCE(NEW.published_at, now()), NEW.created_at, NEW.updated_at, NEW.status, NEW.video_url_principal, COALESCE(NEW.videos_relacionados, '{}'::text[]),
      NEW.manual_image_url, NEW.home_expires_at, NEW.is_evergreen, NEW.main_featured_expires_at, (NEW.source_id IS NULL),
      NEW.event_id, NEW.ai_seo_title, NEW.ai_summary, COALESCE(NEW.ai_entities,'{}'::text[])
    )
    ON CONFLICT (id) DO NOTHING;
  WHEN OTHERS THEN
    RAISE WARNING 'sync_posts_public failed for post % (status=%): % - %', NEW.id, NEW.status, SQLSTATE, SQLERRM;
    INSERT INTO public.sync_audit_log (event_type, post_id, status, error)
    VALUES ('sync_trigger', NEW.id, 'error', SQLERRM);
  END;

  RETURN NEW;
END;
$$;

-- =========================
-- 12) Backfill: cluster posts already published
-- =========================
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.posts
            WHERE status = 'publicada'::public.post_status
              AND event_id IS NULL
            ORDER BY published_at DESC NULLS LAST LIMIT 500
  LOOP
    BEGIN
      PERFORM public.cluster_post_into_event(r.id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;

-- Initial impact scoring + breaking detection
SELECT public.detect_breaking_events();
SELECT public.expire_breaking_events();
