-- Hotfix F3C.1: allowlist é read-only via Data API; escrita apenas interna (SECURITY DEFINER/service_role)

-- 1) Revogar privilégios diretos e conceder apenas SELECT ao authenticated
REVOKE ALL ON public.news_source_allowed_hosts FROM PUBLIC;
REVOKE ALL ON public.news_source_allowed_hosts FROM anon;
REVOKE ALL ON public.news_source_allowed_hosts FROM authenticated;
GRANT SELECT ON public.news_source_allowed_hosts TO authenticated;
GRANT ALL ON public.news_source_allowed_hosts TO service_role;

-- 2) Remover policies de escrita via Data API; manter apenas leitura staff-only
DROP POLICY IF EXISTS "staff insert allowed hosts" ON public.news_source_allowed_hosts;
DROP POLICY IF EXISTS "staff update allowed hosts" ON public.news_source_allowed_hosts;
DROP POLICY IF EXISTS "staff delete allowed hosts" ON public.news_source_allowed_hosts;
-- policy de SELECT já existe e permanece: "staff read allowed hosts"

-- 3) Endurecer EXECUTE da RPC de prévia: somente authenticated (staff é revalidado dentro da função)
REVOKE ALL ON FUNCTION public.preview_allowed_hosts_backfill() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_allowed_hosts_backfill() FROM anon;
GRANT EXECUTE ON FUNCTION public.preview_allowed_hosts_backfill() TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_allowed_hosts_backfill() TO service_role;
