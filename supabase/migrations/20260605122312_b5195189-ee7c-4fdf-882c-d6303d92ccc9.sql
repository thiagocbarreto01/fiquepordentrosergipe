
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_main_admin(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.can_approve_publish(uuid) TO authenticated, anon, service_role;
