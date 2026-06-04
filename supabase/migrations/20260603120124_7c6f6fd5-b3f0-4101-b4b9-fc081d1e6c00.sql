-- Harden public views and restrict execution of security definer functions

DROP VIEW IF EXISTS public.posts_public;
CREATE VIEW public.posts_public
WITH (security_invoker = true) AS
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

DROP VIEW IF EXISTS public.banners_public;
CREATE VIEW public.banners_public
WITH (security_invoker = true) AS
SELECT id, name, image_url, link_url, position, is_active
FROM public.banners
WHERE is_active = true;

GRANT SELECT ON public.banners_public TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.banners_public FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_financial_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.financial_categories (user_id, name, type, icon, color)
    VALUES 
    (NEW.user_id, 'Salário', 'income', 'TrendingUp', '#22c55e'),
    (NEW.user_id, 'Investimentos', 'income', 'PieChart', '#3b82f6'),
    (NEW.user_id, 'Alimentação', 'expense', 'Utensils', '#ef4444'),
    (NEW.user_id, 'Transporte', 'expense', 'Car', '#f59e0b'),
    (NEW.user_id, 'Moradia', 'expense', 'Home', '#6366f1'),
    (NEW.user_id, 'Lazer', 'expense', 'Music', '#ec4899');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.archive_post(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_archive_posts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_approve_publish(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ensure_founder_access() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_duplicate_post(text, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_financial_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_post_views(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_post_status_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_post(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_published_at_on_publish() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_instagram_draft_on_publish() FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.archive_post(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_archive_posts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_approve_publish(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_duplicate_post(text, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_post_views(uuid) TO anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_post(uuid) TO authenticated;