BEGIN;

REVOKE EXECUTE ON FUNCTION public.archive_post(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auto_archive_posts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.find_duplicate_post(text, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.increment_post_views(uuid) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_post(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.archive_post(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_archive_posts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_duplicate_post(text, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_post_views(uuid) TO anon, service_role;
GRANT EXECUTE ON FUNCTION public.restore_post(uuid) TO authenticated;

COMMIT;