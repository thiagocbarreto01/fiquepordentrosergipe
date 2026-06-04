CREATE OR REPLACE FUNCTION public.sync_posts_public()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.posts_public WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.status = 'publicada'::public.post_status
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
$function$;

DROP POLICY IF EXISTS "public read published safe posts" ON public.posts_public;
CREATE POLICY "public read published safe posts"
ON public.posts_public
FOR SELECT
TO anon, authenticated
USING (status = 'publicada'::public.post_status);