-- Endurecer ACL de public.scheduled_publish_events (Passada 4.2B Etapa 1)
BEGIN;

REVOKE ALL ON TABLE public.scheduled_publish_events FROM PUBLIC;
REVOKE ALL ON TABLE public.scheduled_publish_events FROM anon;
REVOKE ALL ON TABLE public.scheduled_publish_events FROM authenticated;

-- Somente leitura para usuários autenticados; RLS restringe a staff.
GRANT SELECT ON TABLE public.scheduled_publish_events TO authenticated;

-- Worker interno (RPCs SECURITY DEFINER rodam como postgres/owner) e service_role continuam operando.
GRANT ALL ON TABLE public.scheduled_publish_events TO service_role;

-- Garantir RLS habilitada (idempotente).
ALTER TABLE public.scheduled_publish_events ENABLE ROW LEVEL SECURITY;

COMMIT;