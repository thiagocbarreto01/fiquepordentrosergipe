
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_financial_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_founder_access() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_profile_role_status() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_super_admin() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_post_status_change() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_published_at_on_publish() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_posts_public() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_instagram_draft_on_publish() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, PUBLIC;
