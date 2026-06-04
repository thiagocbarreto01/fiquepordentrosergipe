CREATE OR REPLACE VIEW public.posts_public
WITH (security_invoker = true)
AS
SELECT
  id,
  title,
  subtitle,
  slug,
  content,
  excerpt,
  cover_image_url,
  category_id,
  author_id,
  tags,
  is_featured,
  is_urgent,
  is_denuncia,
  meta_title,
  meta_description,
  views,
  source_url,
  published_at,
  created_at,
  updated_at,
  status,
  video_url_principal,
  videos_relacionados,
  manual_image_url
FROM posts
WHERE (status = 'publicada'::post_status OR status = 'publicado'::post_status)
  AND (published_at IS NULL OR published_at <= NOW());
