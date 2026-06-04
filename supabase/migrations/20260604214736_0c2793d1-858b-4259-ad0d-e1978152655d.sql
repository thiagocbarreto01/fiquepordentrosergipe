BEGIN;

DROP VIEW IF EXISTS public.posts_public;

CREATE TABLE public.posts_public (
  id uuid PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  title text NOT NULL,
  subtitle text,
  slug text NOT NULL UNIQUE,
  content text NOT NULL,
  excerpt text,
  cover_image_url text,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  author_id uuid,
  tags text[] DEFAULT '{}'::text[],
  is_featured boolean NOT NULL DEFAULT false,
  is_main_featured boolean NOT NULL DEFAULT false,
  is_urgent boolean NOT NULL DEFAULT false,
  is_denuncia boolean NOT NULL DEFAULT false,
  meta_title text,
  meta_description text,
  views integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  status public.post_status NOT NULL,
  video_url_principal text,
  videos_relacionados text[] NOT NULL DEFAULT '{}'::text[],
  manual_image_url text,
  home_expires_at timestamptz,
  is_evergreen boolean NOT NULL DEFAULT false,
  main_featured_expires_at timestamptz,
  is_editorial boolean NOT NULL DEFAULT false
);

GRANT SELECT ON public.posts_public TO anon, authenticated;
GRANT ALL ON public.posts_public TO service_role;

ALTER TABLE public.posts_public ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read published safe posts"
ON public.posts_public
FOR SELECT
TO anon, authenticated
USING (true);

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

  IF NEW.status IN ('publicada'::public.post_status, 'publicado'::public.post_status)
     AND (NEW.published_at IS NULL OR NEW.published_at <= now()) THEN
    INSERT INTO public.posts_public (
      id, title, subtitle, slug, content, excerpt, cover_image_url, category_id, author_id,
      tags, is_featured, is_main_featured, is_urgent, is_denuncia, meta_title, meta_description,
      views, published_at, created_at, updated_at, status, video_url_principal, videos_relacionados,
      manual_image_url, home_expires_at, is_evergreen, main_featured_expires_at, is_editorial
    ) VALUES (
      NEW.id, NEW.title, NEW.subtitle, NEW.slug, NEW.content, NEW.excerpt, NEW.cover_image_url, NEW.category_id, NEW.author_id,
      COALESCE(NEW.tags, '{}'::text[]), NEW.is_featured, NEW.is_main_featured, NEW.is_urgent, NEW.is_denuncia, NEW.meta_title, NEW.meta_description,
      NEW.views, NEW.published_at, NEW.created_at, NEW.updated_at, NEW.status, NEW.video_url_principal, COALESCE(NEW.videos_relacionados, '{}'::text[]),
      NEW.manual_image_url, NEW.home_expires_at, NEW.is_evergreen, NEW.main_featured_expires_at, (NEW.source_id IS NULL)
    )
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
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at,
      status = EXCLUDED.status,
      video_url_principal = EXCLUDED.video_url_principal,
      videos_relacionados = EXCLUDED.videos_relacionados,
      manual_image_url = EXCLUDED.manual_image_url,
      home_expires_at = EXCLUDED.home_expires_at,
      is_evergreen = EXCLUDED.is_evergreen,
      main_featured_expires_at = EXCLUDED.main_featured_expires_at,
      is_editorial = EXCLUDED.is_editorial;
  ELSE
    DELETE FROM public.posts_public WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_posts_public() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_posts_public() TO service_role;

DROP TRIGGER IF EXISTS sync_posts_public_trigger ON public.posts;
CREATE TRIGGER sync_posts_public_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.sync_posts_public();

INSERT INTO public.posts_public (
  id, title, subtitle, slug, content, excerpt, cover_image_url, category_id, author_id,
  tags, is_featured, is_main_featured, is_urgent, is_denuncia, meta_title, meta_description,
  views, published_at, created_at, updated_at, status, video_url_principal, videos_relacionados,
  manual_image_url, home_expires_at, is_evergreen, main_featured_expires_at, is_editorial
)
SELECT
  id, title, subtitle, slug, content, excerpt, cover_image_url, category_id, author_id,
  COALESCE(tags, '{}'::text[]), is_featured, is_main_featured, is_urgent, is_denuncia, meta_title, meta_description,
  views, published_at, created_at, updated_at, status, video_url_principal, COALESCE(videos_relacionados, '{}'::text[]),
  manual_image_url, home_expires_at, is_evergreen, main_featured_expires_at, (source_id IS NULL)
FROM public.posts
WHERE status IN ('publicada'::public.post_status, 'publicado'::public.post_status)
  AND (published_at IS NULL OR published_at <= now())
ON CONFLICT (id) DO NOTHING;

COMMIT;