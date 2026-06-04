-- Fix 1: Make posts_public run as owner (bypass RLS) so we can drop the direct public policy on posts
DROP VIEW IF EXISTS public.posts_public;

CREATE VIEW public.posts_public AS
SELECT id, title, subtitle, slug, content, excerpt, cover_image_url, category_id, author_id,
       tags, is_featured, is_main_featured, is_urgent, is_denuncia, meta_title, meta_description,
       views, source_url, source_id, published_at, created_at, updated_at, status,
       video_url_principal, videos_relacionados, manual_image_url, home_expires_at, is_evergreen,
       main_featured_expires_at
FROM public.posts
WHERE (status = 'publicada'::post_status OR status = 'publicado'::post_status)
  AND (published_at IS NULL OR published_at <= now());

GRANT SELECT ON public.posts_public TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.posts_public FROM anon, authenticated;

-- Fix 2: Drop the direct public policy on raw posts table
DROP POLICY IF EXISTS "published posts public" ON public.posts;

-- Fix 3: Harden profiles_self_update RLS policy
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;

CREATE POLICY "profiles_self_update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND role = (SELECT role FROM public.profiles WHERE user_id = auth.uid())
    AND status = (SELECT status FROM public.profiles WHERE user_id = auth.uid())
    AND approved_by IS NOT DISTINCT FROM (SELECT approved_by FROM public.profiles WHERE user_id = auth.uid())
    AND approved_at IS NOT DISTINCT FROM (SELECT approved_at FROM public.profiles WHERE user_id = auth.uid())
  );