
-- =========================================================================
-- Passada 4.2 — Agendamento seguro de publicação
-- Idempotente. Não altera valores existentes de scheduled_at.
-- =========================================================================

-- ---------- FASE 2: Colunas de auditoria em posts ----------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS scheduled_by uuid NULL,
  ADD COLUMN IF NOT EXISTS scheduled_at_set_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS posts_scheduled_at_idx
  ON public.posts (scheduled_at)
  WHERE scheduled_at IS NOT NULL;

-- ---------- FASE 2: Tabela de auditoria ----------
CREATE TABLE IF NOT EXISTS public.scheduled_publish_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  scheduled_by uuid NULL,
  scheduled_for timestamptz NULL,
  processed_at timestamptz NULL,
  result text NOT NULL,          -- scheduled | cancelled | published | failed | skipped
  reason text NULL,              -- motivo técnico curto (nunca conteúdo/PII)
  attempt integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.scheduled_publish_events TO authenticated;
GRANT ALL    ON public.scheduled_publish_events TO service_role;

ALTER TABLE public.scheduled_publish_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read scheduled events" ON public.scheduled_publish_events;
CREATE POLICY "staff read scheduled events"
  ON public.scheduled_publish_events
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- Sem policies de INSERT/UPDATE/DELETE → clientes autenticados/anon não podem escrever.
-- service_role e SECURITY DEFINER continuam podendo escrever (bypass RLS).

CREATE INDEX IF NOT EXISTS spe_post_created_idx
  ON public.scheduled_publish_events (post_id, created_at DESC);

-- ---------- FASE 3: Trigger de proteção dos campos de agendamento ----------
-- Marca transacional: só as RPCs autorizadas fazem
--   PERFORM set_config('app.scheduling_action', 'internal', true)
-- dentro da mesma transação. Clientes via PostgREST não conseguem SET.
CREATE OR REPLACE FUNCTION public.protect_scheduled_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  marker text := current_setting('app.scheduling_action', true);
BEGIN
  IF NEW.scheduled_at        IS DISTINCT FROM OLD.scheduled_at
     OR NEW.scheduled_by     IS DISTINCT FROM OLD.scheduled_by
     OR NEW.scheduled_at_set_at IS DISTINCT FROM OLD.scheduled_at_set_at
  THEN
    IF marker IS NULL OR marker <> 'internal' THEN
      RAISE EXCEPTION 'Campos de agendamento só podem ser alterados via RPC de agendamento'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_scheduled_fields() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_protect_scheduled_fields ON public.posts;
CREATE TRIGGER trg_protect_scheduled_fields
  BEFORE UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_scheduled_fields();

-- ---------- FASE 4: RPC schedule_post ----------
CREATE OR REPLACE FUNCTION public.schedule_post(
  _post_id uuid,
  _scheduled_for timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
  uid uuid := auth.uid();
  min_ts timestamptz := now() + interval '1 minute';
  max_ts timestamptz := now() + interval '365 days';
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_approve_publish(uid) THEN
    RAISE EXCEPTION 'forbidden: only editor/admin can schedule' USING ERRCODE = '42501';
  END IF;
  IF _scheduled_for IS NULL OR _scheduled_for < min_ts THEN
    RAISE EXCEPTION 'scheduled_for must be in the future (>= now + 1min)' USING ERRCODE = '22023';
  END IF;
  IF _scheduled_for > max_ts THEN
    RAISE EXCEPTION 'scheduled_for exceeds max horizon (1 year)' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO p FROM public.posts WHERE id = _post_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post not found' USING ERRCODE = 'P0002';
  END IF;

  IF p.status IN ('publicada'::public.post_status, 'arquivada'::public.post_status,
                  'duplicada'::public.post_status, 'rejeitada'::public.post_status) THEN
    RAISE EXCEPTION 'cannot schedule post in status %', p.status USING ERRCODE = '22023';
  END IF;

  -- Validações de conteúdo (equivalentes ao checklist do PublishDialog).
  IF p.title IS NULL OR btrim(p.title) = '' THEN
    RAISE EXCEPTION 'missing title' USING ERRCODE = '22023';
  END IF;
  IF p.category_id IS NULL THEN
    RAISE EXCEPTION 'missing category' USING ERRCODE = '22023';
  END IF;
  IF p.content IS NULL OR btrim(regexp_replace(p.content, '<[^>]+>', ' ', 'g')) = '' THEN
    RAISE EXCEPTION 'missing content' USING ERRCODE = '22023';
  END IF;

  -- Capa: obrigatória exceto se houver exceção editorial marcada.
  IF (p.cover_image_url IS NULL OR btrim(p.cover_image_url) = '')
     AND (p.manual_image_url IS NULL OR btrim(p.manual_image_url) = '')
     AND COALESCE(p.cover_override, false) = false
  THEN
    RAISE EXCEPTION 'missing cover image (no editorial override)' USING ERRCODE = '22023';
  END IF;

  -- Plantão exige validade futura (após a publicação agendada).
  IF COALESCE(p.is_urgent, false) THEN
    IF p.home_expires_at IS NULL OR p.home_expires_at <= _scheduled_for THEN
      RAISE EXCEPTION 'urgent post requires home_expires_at after scheduled_for'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Fixação: se estiver setada, exige until futuro (após scheduled) e motivo.
  IF p.pinned_until IS NOT NULL THEN
    IF p.pinned_until <= _scheduled_for THEN
      RAISE EXCEPTION 'pinning expires before scheduled_for' USING ERRCODE = '22023';
    END IF;
    IF p.pinned_reason IS NULL OR length(btrim(p.pinned_reason)) < 3 THEN
      RAISE EXCEPTION 'pinning requires reason' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Marca a transação como interna para atravessar o trigger de proteção.
  PERFORM set_config('app.scheduling_action', 'internal', true);

  UPDATE public.posts
     SET scheduled_at        = _scheduled_for,
         scheduled_by        = uid,
         scheduled_at_set_at = now(),
         status              = 'aprovada'::public.post_status
   WHERE id = _post_id;

  INSERT INTO public.scheduled_publish_events
    (post_id, scheduled_by, scheduled_for, result, reason)
  VALUES (_post_id, uid, _scheduled_for, 'scheduled', NULL);

  RETURN jsonb_build_object(
    'post_id',      _post_id,
    'scheduled_at', _scheduled_for,
    'status',       'aprovada'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_post(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_post(uuid, timestamptz) TO authenticated;

-- ---------- FASE 5: RPC cancel_scheduled_post ----------
CREATE OR REPLACE FUNCTION public.cancel_scheduled_post(_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
  uid uuid := auth.uid();
  new_status public.post_status;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_approve_publish(uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO p FROM public.posts WHERE id = _post_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post not found' USING ERRCODE = 'P0002';
  END IF;

  -- Nunca despublicar matéria já publicada.
  IF p.status = 'publicada'::public.post_status THEN
    -- No-op: só limpa a marca de agendamento se ainda estiver (não deveria).
    IF p.scheduled_at IS NULL THEN
      RETURN jsonb_build_object('post_id', _post_id, 'status', 'publicada',
                                 'scheduled_at', NULL, 'noop', true);
    END IF;
  END IF;

  -- Se não há agendamento, é no-op.
  IF p.scheduled_at IS NULL THEN
    RETURN jsonb_build_object('post_id', _post_id, 'status', p.status::text,
                               'scheduled_at', NULL, 'noop', true);
  END IF;

  -- Se estava 'aprovada' apenas por causa do agendamento → volta para em_revisao.
  IF p.status = 'aprovada'::public.post_status THEN
    new_status := 'em_revisao'::public.post_status;
  ELSE
    new_status := p.status;
  END IF;

  PERFORM set_config('app.scheduling_action', 'internal', true);

  UPDATE public.posts
     SET scheduled_at        = NULL,
         scheduled_by        = NULL,
         scheduled_at_set_at = NULL,
         status              = new_status
   WHERE id = _post_id;

  INSERT INTO public.scheduled_publish_events
    (post_id, scheduled_by, scheduled_for, result, reason)
  VALUES (_post_id, uid, p.scheduled_at, 'cancelled', NULL);

  RETURN jsonb_build_object(
    'post_id',      _post_id,
    'status',       new_status::text,
    'scheduled_at', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_scheduled_post(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_scheduled_post(uuid) TO authenticated;

-- ---------- FASE 6: publish_due_scheduled_posts ----------
CREATE OR REPLACE FUNCTION public.publish_due_scheduled_posts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  published_count int := 0;
  failed_count int := 0;
  reason text;
BEGIN
  IF NOT pg_try_advisory_xact_lock(4211011) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'busy');
  END IF;

  FOR r IN
    SELECT id, title, category_id, content, cover_image_url, manual_image_url,
           COALESCE(cover_override,false) AS cover_override,
           is_urgent, home_expires_at,
           pinned_until, pinned_reason,
           scheduled_at, scheduled_by, status
      FROM public.posts
     WHERE scheduled_at IS NOT NULL
       AND scheduled_at <= now()
       AND status = 'aprovada'::public.post_status
       AND scheduled_by IS NOT NULL
     ORDER BY scheduled_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT 50
  LOOP
    reason := NULL;

    -- Revalidação no instante da execução.
    IF NOT public.can_approve_publish(r.scheduled_by) THEN
      reason := 'scheduler lost permission';
    ELSIF r.title IS NULL OR btrim(r.title) = '' THEN
      reason := 'missing title';
    ELSIF r.category_id IS NULL THEN
      reason := 'missing category';
    ELSIF r.content IS NULL OR btrim(regexp_replace(r.content, '<[^>]+>', ' ', 'g')) = '' THEN
      reason := 'missing content';
    ELSIF (r.cover_image_url IS NULL OR btrim(r.cover_image_url)='')
       AND (r.manual_image_url IS NULL OR btrim(r.manual_image_url)='')
       AND r.cover_override = false THEN
      reason := 'missing cover';
    ELSIF COALESCE(r.is_urgent,false)
          AND (r.home_expires_at IS NULL OR r.home_expires_at <= now()) THEN
      reason := 'urgent expired';
    ELSIF r.pinned_until IS NOT NULL
          AND (r.pinned_until <= now()
               OR r.pinned_reason IS NULL
               OR length(btrim(r.pinned_reason)) < 3) THEN
      reason := 'invalid pinning';
    END IF;

    IF reason IS NOT NULL THEN
      -- Falha permanente: limpa agendamento e volta para em_revisao.
      PERFORM set_config('app.scheduling_action', 'internal', true);
      UPDATE public.posts
         SET scheduled_at = NULL,
             scheduled_by = NULL,
             scheduled_at_set_at = NULL,
             status = 'em_revisao'::public.post_status
       WHERE id = r.id
         AND status = 'aprovada'::public.post_status; -- idempotência

      INSERT INTO public.scheduled_publish_events
        (post_id, scheduled_by, scheduled_for, processed_at, result, reason)
      VALUES (r.id, r.scheduled_by, r.scheduled_at, now(), 'failed', reason);

      failed_count := failed_count + 1;
      CONTINUE;
    END IF;

    -- Publica.
    PERFORM set_config('app.scheduling_action', 'internal', true);
    UPDATE public.posts
       SET status              = 'publicada'::public.post_status,
           published_at        = now(),
           scheduled_at        = NULL,
           scheduled_by        = NULL,
           scheduled_at_set_at = NULL
     WHERE id = r.id
       AND status = 'aprovada'::public.post_status; -- idempotência dupla

    INSERT INTO public.scheduled_publish_events
      (post_id, scheduled_by, scheduled_for, processed_at, result, reason)
    VALUES (r.id, r.scheduled_by, r.scheduled_at, now(), 'published', NULL);

    published_count := published_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'skipped', false,
    'published', published_count,
    'failed', failed_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_due_scheduled_posts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_due_scheduled_posts() TO postgres, service_role;

-- ---------- FASE 7: Cron ----------
DO $cron$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'publish-scheduled-posts';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
  PERFORM cron.schedule(
    'publish-scheduled-posts',
    '*/5 * * * *',
    $sql$ SELECT public.publish_due_scheduled_posts(); $sql$
  );
END
$cron$;
