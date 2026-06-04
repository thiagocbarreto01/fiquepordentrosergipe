REVOKE ALL ON public.banners FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.banners TO authenticated;
GRANT ALL ON public.banners TO service_role;

DROP POLICY IF EXISTS "public read active banners" ON public.banners;
DROP POLICY IF EXISTS "active banners public" ON public.banners;

DROP VIEW IF EXISTS public.banners_public;
CREATE VIEW public.banners_public
WITH (security_invoker = true) AS
SELECT id, name, image_url, link_url, position
FROM public.banners
WHERE is_active = true;

GRANT SELECT ON public.banners_public TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.banners_public FROM anon, authenticated;