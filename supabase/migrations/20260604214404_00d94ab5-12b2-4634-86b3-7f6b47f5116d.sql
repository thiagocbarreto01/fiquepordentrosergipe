BEGIN;

-- 1) Public article access must go through the limited public view, not the base table.
DROP POLICY IF EXISTS "public read published posts" ON public.posts;

DROP VIEW IF EXISTS public.posts_public;

CREATE VIEW public.posts_public AS
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
  is_main_featured,
  is_urgent,
  is_denuncia,
  meta_title,
  meta_description,
  views,
  published_at,
  created_at,
  updated_at,
  status,
  video_url_principal,
  videos_relacionados,
  manual_image_url,
  home_expires_at,
  is_evergreen,
  main_featured_expires_at,
  (source_id IS NULL) AS is_editorial
FROM public.posts
WHERE status IN ('publicada'::public.post_status, 'publicado'::public.post_status)
  AND (published_at IS NULL OR published_at <= now());

ALTER VIEW public.posts_public SET (security_invoker = false);
GRANT SELECT ON public.posts_public TO anon, authenticated;
GRANT ALL ON public.posts_public TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.posts_public FROM anon, authenticated;

-- 2) Anonymous complaints may not store contact PII; contact-bearing submissions require auth.
DROP POLICY IF EXISTS "anyone submits denuncia" ON public.denuncias;

CREATE POLICY "public submits anonymous or authenticated contact denuncia"
ON public.denuncias
FOR INSERT
TO public
WITH CHECK (
  char_length(title) >= 5
  AND char_length(title) <= 200
  AND char_length(description) >= 10
  AND char_length(description) <= 5000
  AND status = 'nova'::public.denuncia_status
  AND (
    (
      is_anonymous = true
      AND contact_name IS NULL
      AND contact_phone IS NULL
      AND contact_email IS NULL
    )
    OR
    (
      is_anonymous = false
      AND auth.uid() IS NOT NULL
    )
  )
);

-- 3) Add trigger-backed role/status protection on profiles for defense in depth.
DROP TRIGGER IF EXISTS protect_profile_role_status_trigger ON public.profiles;
CREATE TRIGGER protect_profile_role_status_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_role_status();

-- 4) Reduce directly callable SECURITY DEFINER surface area.
REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_founder_access() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_financial_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_post_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_profile_role_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_super_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_published_at_on_publish() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_instagram_draft_on_publish() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_main_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_approve_publish(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_post_views(uuid) TO anon, service_role;
GRANT EXECUTE ON FUNCTION public.archive_post(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_post(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_archive_posts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_duplicate_post(text, text, text, uuid) TO authenticated, service_role;

COMMIT;