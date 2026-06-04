
DROP VIEW IF EXISTS public.posts_public;
CREATE VIEW public.posts_public AS
SELECT id, title, subtitle, slug, content, excerpt, cover_image_url, category_id, author_id,
       tags, is_featured, is_main_featured, is_urgent, is_denuncia, meta_title, meta_description,
       views, source_url, source_id, published_at, created_at, updated_at, status,
       video_url_principal, videos_relacionados, manual_image_url, home_expires_at, is_evergreen
FROM public.posts
WHERE (status = 'publicada'::post_status OR status = 'publicado'::post_status)
  AND (published_at IS NULL OR published_at <= now());

GRANT SELECT ON public.posts_public TO anon, authenticated;
