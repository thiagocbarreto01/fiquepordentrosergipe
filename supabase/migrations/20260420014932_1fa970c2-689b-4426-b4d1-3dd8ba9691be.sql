
-- View pública sem campos internos de IA / editorial
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
  status
FROM public.posts
WHERE status = 'publicada';

GRANT SELECT ON public.posts_public TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.posts_public FROM anon, authenticated;

COMMENT ON VIEW public.posts_public IS
'View pública usada pelo portal. Esconde campos editoriais internos (titulo_original, conteudo_original, *_gerado, ai_*, source_id, external_id, duplicate_of) que devem ficar restritos ao painel admin.';
