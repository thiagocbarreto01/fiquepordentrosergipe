
-- 1) Recreate sync function with exception handling so failures are logged, not silenced
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

  BEGIN
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
        NEW.views, COALESCE(NEW.published_at, now()), NEW.created_at, NEW.updated_at, NEW.status, NEW.video_url_principal, COALESCE(NEW.videos_relacionados, '{}'::text[]),
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
  EXCEPTION WHEN unique_violation THEN
    -- Slug collision: keep the newest. Remove the older row with the same slug then retry.
    DELETE FROM public.posts_public
     WHERE slug = NEW.slug AND id <> NEW.id;
    INSERT INTO public.posts_public (
      id, title, subtitle, slug, content, excerpt, cover_image_url, category_id, author_id,
      tags, is_featured, is_main_featured, is_urgent, is_denuncia, meta_title, meta_description,
      views, published_at, created_at, updated_at, status, video_url_principal, videos_relacionados,
      manual_image_url, home_expires_at, is_evergreen, main_featured_expires_at, is_editorial
    ) VALUES (
      NEW.id, NEW.title, NEW.subtitle, NEW.slug, NEW.content, NEW.excerpt, NEW.cover_image_url, NEW.category_id, NEW.author_id,
      COALESCE(NEW.tags, '{}'::text[]), NEW.is_featured, NEW.is_main_featured, NEW.is_urgent, NEW.is_denuncia, NEW.meta_title, NEW.meta_description,
      NEW.views, COALESCE(NEW.published_at, now()), NEW.created_at, NEW.updated_at, NEW.status, NEW.video_url_principal, COALESCE(NEW.videos_relacionados, '{}'::text[]),
      NEW.manual_image_url, NEW.home_expires_at, NEW.is_evergreen, NEW.main_featured_expires_at, (NEW.source_id IS NULL)
    )
    ON CONFLICT (id) DO NOTHING;
  WHEN OTHERS THEN
    RAISE WARNING 'sync_posts_public failed for post % (status=%): % - %', NEW.id, NEW.status, SQLSTATE, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- 2) Public RPC to force a full backfill (admins / staff only)
CREATE OR REPLACE FUNCTION public.resync_posts_public()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Remove rows that should no longer be public
  DELETE FROM public.posts_public pp
   WHERE NOT EXISTS (
     SELECT 1 FROM public.posts p
      WHERE p.id = pp.id
        AND p.status = 'publicada'::public.post_status
        AND (p.published_at IS NULL OR p.published_at <= now())
   );

  -- Upsert all published posts
  WITH upserted AS (
    INSERT INTO public.posts_public (
      id, title, subtitle, slug, content, excerpt, cover_image_url, category_id, author_id,
      tags, is_featured, is_main_featured, is_urgent, is_denuncia, meta_title, meta_description,
      views, published_at, created_at, updated_at, status, video_url_principal, videos_relacionados,
      manual_image_url, home_expires_at, is_evergreen, main_featured_expires_at, is_editorial
    )
    SELECT
      p.id, p.title, p.subtitle, p.slug, p.content, p.excerpt, p.cover_image_url, p.category_id, p.author_id,
      COALESCE(p.tags,'{}'::text[]), p.is_featured, p.is_main_featured, p.is_urgent, p.is_denuncia, p.meta_title, p.meta_description,
      p.views, COALESCE(p.published_at, now()), p.created_at, p.updated_at, p.status, p.video_url_principal, COALESCE(p.videos_relacionados,'{}'::text[]),
      p.manual_image_url, p.home_expires_at, p.is_evergreen, p.main_featured_expires_at, (p.source_id IS NULL)
    FROM public.posts p
    WHERE p.status = 'publicada'::public.post_status
      AND (p.published_at IS NULL OR p.published_at <= now())
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
      updated_at = EXCLUDED.updated_at,
      status = EXCLUDED.status,
      video_url_principal = EXCLUDED.video_url_principal,
      videos_relacionados = EXCLUDED.videos_relacionados,
      manual_image_url = EXCLUDED.manual_image_url,
      home_expires_at = EXCLUDED.home_expires_at,
      is_evergreen = EXCLUDED.is_evergreen,
      main_featured_expires_at = EXCLUDED.main_featured_expires_at,
      is_editorial = EXCLUDED.is_editorial
    RETURNING 1
  )
  SELECT count(*) INTO affected FROM upserted;

  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resync_posts_public() TO authenticated;
