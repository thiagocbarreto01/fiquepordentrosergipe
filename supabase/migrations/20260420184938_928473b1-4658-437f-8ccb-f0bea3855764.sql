-- Allow public read access to active banners via banners_public view
-- 1. Add SELECT policy on banners table for active banners (public)
CREATE POLICY "public read active banners"
ON public.banners
FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- 2. Make the view use the querying user's permissions (security_invoker)
ALTER VIEW public.banners_public SET (security_invoker = on);

-- 3. Grant SELECT on the view to anon and authenticated roles
GRANT SELECT ON public.banners_public TO anon, authenticated;