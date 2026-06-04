BEGIN;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role::text = _role
        OR (role = 'admin'::public.app_role AND _role IN ('admin', 'editor', 'redator', 'super_admin'))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::public.app_role, 'editor'::public.app_role, 'redator'::public.app_role)
  );
$$;

ALTER VIEW public.posts_public SET (security_invoker = true);
ALTER VIEW public.banners_public SET (security_invoker = true);

CREATE OR REPLACE VIEW public.posts_public
WITH (security_invoker = true) AS
SELECT id,
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
       source_url,
       source_id,
       published_at,
       created_at,
       updated_at,
       status,
       video_url_principal,
       videos_relacionados,
       manual_image_url,
       home_expires_at,
       is_evergreen,
       main_featured_expires_at
FROM public.posts
WHERE (status = 'publicada'::public.post_status OR status = 'publicado'::public.post_status)
  AND (published_at IS NULL OR published_at <= now());

CREATE OR REPLACE VIEW public.banners_public
WITH (security_invoker = true) AS
SELECT id,
       name,
       image_url,
       link_url,
       position
FROM public.banners
WHERE is_active = true;

REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_approve_publish(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_founder_access() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_financial_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_main_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_post_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_profile_role_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_super_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_published_at_on_publish() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_instagram_draft_on_publish() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.archive_post(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_archive_posts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_approve_publish(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_duplicate_post(text, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_post_views(uuid) TO anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_main_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_post(uuid) TO authenticated;

COMMIT;