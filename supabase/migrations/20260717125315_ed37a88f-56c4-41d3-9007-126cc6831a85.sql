
-- 1) Coluna nova
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS scheduled_from_status public.post_status;

-- 2) schedule_post: preservar status anterior
CREATE OR REPLACE FUNCTION public.schedule_post(_post_id uuid, _scheduled_for timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p RECORD;
  uid uuid := auth.uid();
  min_ts timestamptz := now() + interval '1 minute';
  max_ts timestamptz := now() + interval '365 days';
  from_status public.post_status;
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

  IF p.title IS NULL OR btrim(p.title) = '' THEN
    RAISE EXCEPTION 'missing title' USING ERRCODE = '22023';
  END IF;
  IF p.category_id IS NULL THEN
    RAISE EXCEPTION 'missing category' USING ERRCODE = '22023';
  END IF;
  IF p.content IS NULL OR btrim(regexp_replace(p.content, '<[^>]+>', ' ', 'g')) = '' THEN
    RAISE EXCEPTION 'missing content' USING ERRCODE = '22023';
  END IF;
  IF (p.cover_image_url IS NULL OR btrim(p.cover_image_url) = '')
     AND (p.manual_image_url IS NULL OR btrim(p.manual_image_url) = '')
  THEN
    RAISE EXCEPTION 'missing cover image' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p.is_urgent, false) THEN
    IF p.home_expires_at IS NULL OR p.home_expires_at <= _scheduled_for THEN
      RAISE EXCEPTION 'urgent post requires home_expires_at after scheduled_for'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p.pinned_until IS NOT NULL THEN
    IF p.pinned_until <= _scheduled_for THEN
      RAISE EXCEPTION 'pinning expires before scheduled_for' USING ERRCODE = '22023';
    END IF;
    IF p.pinned_reason IS NULL OR length(btrim(p.pinned_reason)) < 3 THEN
      RAISE EXCEPTION 'pinning requires reason' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Preservar status anterior: só grava se ainda não estiver agendado
  IF p.scheduled_at IS NULL OR p.scheduled_from_status IS NULL THEN
    from_status := p.status;
  ELSE
    from_status := p.scheduled_from_status;
  END IF;

  PERFORM set_config('app.scheduling_action', 'internal', true);

  UPDATE public.posts
     SET scheduled_at          = _scheduled_for,
         scheduled_by          = uid,
         scheduled_at_set_at   = now(),
         scheduled_from_status = from_status,
         status                = 'aprovada'::public.post_status
   WHERE id = _post_id;

  INSERT INTO public.scheduled_publish_events
    (post_id, scheduled_by, scheduled_for, result, reason)
  VALUES (_post_id, uid, _scheduled_for, 'scheduled', 'from_status=' || from_status::text);

  RETURN jsonb_build_object(
    'post_id', _post_id,
    'scheduled_at', _scheduled_for,
    'status', 'aprovada',
    'scheduled_from_status', from_status::text
  );
END;
$function$;

-- 3) cancel_scheduled_post: restaurar exatamente scheduled_from_status
CREATE OR REPLACE FUNCTION public.cancel_scheduled_post(_post_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    IF p.scheduled_at IS NULL THEN
      RETURN jsonb_build_object('post_id', _post_id, 'status', 'publicada',
                                 'scheduled_at', NULL, 'noop', true);
    END IF;
  END IF;

  IF p.scheduled_at IS NULL THEN
    RETURN jsonb_build_object('post_id', _post_id, 'status', p.status::text,
                               'scheduled_at', NULL, 'noop', true);
  END IF;

  -- Restaurar status anterior, se registrado; senão fallback seguro
  IF p.scheduled_from_status IS NOT NULL THEN
    new_status := p.scheduled_from_status;
  ELSIF p.status = 'aprovada'::public.post_status THEN
    new_status := 'em_revisao'::public.post_status;  -- fallback documentado (legado)
  ELSE
    new_status := p.status;
  END IF;

  PERFORM set_config('app.scheduling_action', 'internal', true);

  UPDATE public.posts
     SET scheduled_at          = NULL,
         scheduled_by          = NULL,
         scheduled_at_set_at   = NULL,
         scheduled_from_status = NULL,
         status                = new_status
   WHERE id = _post_id;

  INSERT INTO public.scheduled_publish_events
    (post_id, scheduled_by, scheduled_for, result, reason)
  VALUES (_post_id, uid, p.scheduled_at, 'cancelled', 'restored_to=' || new_status::text);

  RETURN jsonb_build_object(
    'post_id',      _post_id,
    'status',       new_status::text,
    'scheduled_at', NULL
  );
END;
$function$;

-- 4) publish_due_scheduled_posts: limpar scheduled_from_status
CREATE OR REPLACE FUNCTION public.publish_due_scheduled_posts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  published_count int := 0;
  failed_count int := 0;
  reason text;
  fallback_status public.post_status;
BEGIN
  IF NOT pg_try_advisory_xact_lock(4211011) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'busy');
  END IF;

  FOR r IN
    SELECT id, title, category_id, content, cover_image_url, manual_image_url,
           is_urgent, home_expires_at, pinned_until, pinned_reason,
           scheduled_at, scheduled_by, status, scheduled_from_status
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

    IF NOT public.can_approve_publish(r.scheduled_by) THEN
      reason := 'scheduler lost permission';
    ELSIF r.title IS NULL OR btrim(r.title) = '' THEN
      reason := 'missing title';
    ELSIF r.category_id IS NULL THEN
      reason := 'missing category';
    ELSIF r.content IS NULL OR btrim(regexp_replace(r.content, '<[^>]+>', ' ', 'g')) = '' THEN
      reason := 'missing content';
    ELSIF (r.cover_image_url IS NULL OR btrim(r.cover_image_url)='')
       AND (r.manual_image_url IS NULL OR btrim(r.manual_image_url)='') THEN
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
      -- Preferir status anterior quando ainda válido
      IF r.scheduled_from_status IS NOT NULL
         AND r.scheduled_from_status NOT IN ('publicada'::public.post_status, 'arquivada'::public.post_status)
      THEN
        fallback_status := r.scheduled_from_status;
      ELSE
        fallback_status := 'em_revisao'::public.post_status;
      END IF;

      PERFORM set_config('app.scheduling_action', 'internal', true);
      UPDATE public.posts
         SET scheduled_at          = NULL,
             scheduled_by          = NULL,
             scheduled_at_set_at   = NULL,
             scheduled_from_status = NULL,
             status                = fallback_status
       WHERE id = r.id
         AND status = 'aprovada'::public.post_status;

      INSERT INTO public.scheduled_publish_events
        (post_id, scheduled_by, scheduled_for, processed_at, result, reason)
      VALUES (r.id, r.scheduled_by, r.scheduled_at, now(), 'failed',
              reason || '; restored_to=' || fallback_status::text);

      failed_count := failed_count + 1;
      CONTINUE;
    END IF;

    PERFORM set_config('app.scheduling_action', 'internal', true);
    UPDATE public.posts
       SET status                = 'publicada'::public.post_status,
           published_at          = now(),
           scheduled_at          = NULL,
           scheduled_by          = NULL,
           scheduled_at_set_at   = NULL,
           scheduled_from_status = NULL
     WHERE id = r.id
       AND status = 'aprovada'::public.post_status;

    INSERT INTO public.scheduled_publish_events
      (post_id, scheduled_by, scheduled_for, processed_at, result, reason)
    VALUES (r.id, r.scheduled_by, r.scheduled_at, now(), 'published',
            'from_status=' || COALESCE(r.scheduled_from_status::text,'unknown'));

    published_count := published_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'skipped', false,
    'published', published_count,
    'failed', failed_count
  );
END;
$function$;

-- 5) protect_scheduled_fields: proteger nova coluna e travar mudanças de status
--    enquanto scheduled_at estiver ativo (só via marcador interno das RPCs).
CREATE OR REPLACE FUNCTION public.protect_scheduled_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  marker text := current_setting('app.scheduling_action', true);
  is_internal boolean := (marker = 'internal');
BEGIN
  -- Bloqueia alterações diretas nos campos de agendamento
  IF NEW.scheduled_at            IS DISTINCT FROM OLD.scheduled_at
     OR NEW.scheduled_by         IS DISTINCT FROM OLD.scheduled_by
     OR NEW.scheduled_at_set_at  IS DISTINCT FROM OLD.scheduled_at_set_at
     OR NEW.scheduled_from_status IS DISTINCT FROM OLD.scheduled_from_status
  THEN
    IF NOT is_internal THEN
      RAISE EXCEPTION 'Campos de agendamento só podem ser alterados via RPC de agendamento'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Enquanto houver agendamento ativo, o UPDATE comum não pode mexer no status.
  -- Só as RPCs internas (que setam o marcador) podem transicionar.
  IF OLD.scheduled_at IS NOT NULL
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NOT is_internal
  THEN
    RAISE EXCEPTION 'Não é possível alterar o status enquanto a matéria está agendada. Cancele o agendamento primeiro.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
