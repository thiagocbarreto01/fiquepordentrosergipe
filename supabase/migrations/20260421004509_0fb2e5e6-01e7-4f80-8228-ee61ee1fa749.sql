CREATE OR REPLACE VIEW public.posts_public AS
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
  videos_relacionados
FROM public.posts
WHERE status = 'publicada'::post_status;