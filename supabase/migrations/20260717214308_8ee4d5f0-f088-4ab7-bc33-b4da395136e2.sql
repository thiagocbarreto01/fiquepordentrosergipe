
-- 1) ACL das RPCs
REVOKE EXECUTE ON FUNCTION public.denuncia_set_status(uuid, denuncia_status, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.denuncia_archive(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.denuncia_restore(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.denuncia_update_notes(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.denuncia_delete(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.denuncia_set_status(uuid, denuncia_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.denuncia_archive(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.denuncia_restore(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.denuncia_update_notes(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.denuncia_delete(uuid, text) TO authenticated;

-- 2) Tabela rate limit (interna)
CREATE TABLE IF NOT EXISTS public.denuncia_rate_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_hash text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS denuncia_rate_limits_hash_time_idx
  ON public.denuncia_rate_limits (requester_hash, attempted_at DESC);

REVOKE ALL ON public.denuncia_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.denuncia_rate_limits TO service_role;

ALTER TABLE public.denuncia_rate_limits ENABLE ROW LEVEL SECURITY;
-- Sem policies: bloqueio total via RLS para anon/authenticated.

-- 3) Função interna transacional de rate limit
CREATE OR REPLACE FUNCTION public.denuncia_rate_limit_hit(_requester_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count int;
  lock_key bigint;
BEGIN
  IF _requester_hash IS NULL OR length(_requester_hash) < 16 THEN
    RAISE EXCEPTION 'invalid_requester' USING ERRCODE='22023';
  END IF;

  -- Advisory lock por hash para evitar corrida
  lock_key := ('x' || substr(md5(_requester_hash), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(lock_key);

  SELECT count(*) INTO recent_count
    FROM public.denuncia_rate_limits
   WHERE requester_hash = _requester_hash
     AND attempted_at > now() - interval '1 hour';

  IF recent_count >= 5 THEN
    RAISE EXCEPTION 'hourly_limit' USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.denuncia_rate_limits(requester_hash) VALUES (_requester_hash);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.denuncia_rate_limit_hit(text) FROM PUBLIC, anon, authenticated;
-- service_role/owner apenas (owner é postgres implícito).

-- 4) Cleanup idempotente
CREATE OR REPLACE FUNCTION public.denuncia_rate_limits_cleanup()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.denuncia_rate_limits WHERE attempted_at < now() - interval '48 hours';
$$;
REVOKE EXECUTE ON FUNCTION public.denuncia_rate_limits_cleanup() FROM PUBLIC, anon, authenticated;

-- 5) Cron diário (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='denuncia_rate_limits_cleanup_daily') THEN
      PERFORM cron.schedule(
        'denuncia_rate_limits_cleanup_daily',
        '17 3 * * *',
        $cron$ SELECT public.denuncia_rate_limits_cleanup(); $cron$
      );
    END IF;
  END IF;
END $$;
