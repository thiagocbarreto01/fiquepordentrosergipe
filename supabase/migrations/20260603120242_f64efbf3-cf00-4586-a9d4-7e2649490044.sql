REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin() FROM service_role, sandbox_exec;
REVOKE EXECUTE ON FUNCTION public.ensure_founder_access() FROM service_role, sandbox_exec;
REVOKE EXECUTE ON FUNCTION public.handle_new_financial_user() FROM service_role, sandbox_exec;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM service_role, sandbox_exec;
REVOKE EXECUTE ON FUNCTION public.log_post_status_change() FROM service_role, sandbox_exec;
REVOKE EXECUTE ON FUNCTION public.set_published_at_on_publish() FROM service_role, sandbox_exec;
REVOKE EXECUTE ON FUNCTION public.trigger_instagram_draft_on_publish() FROM service_role, sandbox_exec;