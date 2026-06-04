DROP POLICY IF EXISTS "public increment post views" ON public.posts_public;

REVOKE UPDATE ON public.posts_public FROM anon, authenticated;
REVOKE UPDATE (views) ON public.posts_public FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_post_views(_post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.posts_public
     SET views = views + 1
   WHERE id = _post_id
     AND status IN ('publicada'::public.post_status, 'publicado'::public.post_status);
$$;

REVOKE EXECUTE ON FUNCTION public.increment_post_views(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_post_views(uuid) TO anon, service_role;