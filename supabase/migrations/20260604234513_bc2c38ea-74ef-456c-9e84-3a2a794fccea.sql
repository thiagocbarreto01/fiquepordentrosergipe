CREATE OR REPLACE FUNCTION public.increment_post_views(_post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  UPDATE public.posts_public
     SET views = views + 1
   WHERE id = _post_id
     AND status IN ('publicada'::public.post_status, 'publicado'::public.post_status);
$$;

GRANT UPDATE (views) ON public.posts_public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_post_views(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "public increment post views" ON public.posts_public;
CREATE POLICY "public increment post views"
ON public.posts_public
FOR UPDATE
TO anon, authenticated
USING (status IN ('publicada'::public.post_status, 'publicado'::public.post_status))
WITH CHECK (status IN ('publicada'::public.post_status, 'publicado'::public.post_status));