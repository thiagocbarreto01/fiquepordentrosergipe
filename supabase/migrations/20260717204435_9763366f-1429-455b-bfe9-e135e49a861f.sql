-- =====================================================
-- BANNERS: privacidade, CHECKs e normalização
-- Idempotente. Não altera dados (tabela vazia).
-- =====================================================

-- 1) Fechar acesso público à tabela base
REVOKE ALL ON public.banners FROM PUBLIC;
REVOKE ALL ON public.banners FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.banners TO authenticated;
GRANT ALL ON public.banners TO service_role;

-- A policy pública deixa de ser necessária (anon não tem mais SELECT na base)
DROP POLICY IF EXISTS "public read active banners" ON public.banners;

-- 2) View pública mínima com janela de agendamento
--    security_invoker=false para que o portal (anon) leia via view
--    sem precisar de SELECT na tabela base.
DROP VIEW IF EXISTS public.banners_public;
CREATE VIEW public.banners_public
WITH (security_invoker = false) AS
SELECT
  id,
  name,
  image_url,
  link_url,
  "position"
FROM public.banners
WHERE is_active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at   IS NULL OR ends_at   >= now());

REVOKE ALL ON public.banners_public FROM PUBLIC;
GRANT SELECT ON public.banners_public TO anon, authenticated;

COMMENT ON VIEW public.banners_public IS
  'Projeção pública de banners ativos dentro da janela de agendamento. Expõe apenas campos de renderização; não expõe sponsor, clicks, impressions ou datas.';

-- 3) CHECK constraints de URL e janela
--    Rejeita javascript:, data:, file: e caminhos relativos.
--    Regex imutáveis; seguros como CHECK.
ALTER TABLE public.banners
  DROP CONSTRAINT IF EXISTS banners_image_url_scheme,
  DROP CONSTRAINT IF EXISTS banners_link_url_scheme,
  DROP CONSTRAINT IF EXISTS banners_dates_order;

ALTER TABLE public.banners
  ADD CONSTRAINT banners_image_url_scheme
    CHECK (image_url ~* '^https?://[^ \t\r\n]+$'),
  ADD CONSTRAINT banners_link_url_scheme
    CHECK (link_url IS NULL OR link_url ~* '^https?://[^ \t\r\n]+$'),
  ADD CONSTRAINT banners_dates_order
    CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at);

-- 4) Normalização (link vazio -> NULL, trim, updated_at)
CREATE OR REPLACE FUNCTION public.banners_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.link_url IS NOT NULL AND btrim(NEW.link_url) = '' THEN
    NEW.link_url := NULL;
  ELSIF NEW.link_url IS NOT NULL THEN
    NEW.link_url := btrim(NEW.link_url);
  END IF;

  IF NEW.image_url IS NOT NULL THEN
    NEW.image_url := btrim(NEW.image_url);
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS banners_normalize_trg ON public.banners;
CREATE TRIGGER banners_normalize_trg
BEFORE INSERT OR UPDATE ON public.banners
FOR EACH ROW EXECUTE FUNCTION public.banners_normalize();
