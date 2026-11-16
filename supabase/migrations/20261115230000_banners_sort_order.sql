-- Ordem de exibição dos anúncios (menor número aparece primeiro)
ALTER TABLE public.banners ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

DROP VIEW IF EXISTS public.banners_public;
CREATE VIEW public.banners_public
WITH (security_invoker = false) AS
SELECT
  id,
  name,
  image_url,
  link_url,
  "position",
  sort_order
FROM public.banners
WHERE is_active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at   IS NULL OR ends_at   >= now());

REVOKE ALL ON public.banners_public FROM PUBLIC;
GRANT SELECT ON public.banners_public TO anon, authenticated;
