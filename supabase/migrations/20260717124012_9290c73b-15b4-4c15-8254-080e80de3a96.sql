
-- Recria schedule_post sem cover_override
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
    'post_id', _post_id,
    'scheduled_at', _scheduled_for,
    'status', 'aprovada'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_post(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_post(uuid, timestamptz) TO authenticated;

-- Recria publish_due_scheduled_posts sem cover_override
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
           is_urgent, home_expires_at, pinned_until, pinned_reason,
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
      PERFORM set_config('app.scheduling_action', 'internal', true);
      UPDATE public.posts
         SET scheduled_at = NULL,
             scheduled_by = NULL,
             scheduled_at_set_at = NULL,
             status = 'em_revisao'::public.post_status
       WHERE id = r.id
         AND status = 'aprovada'::public.post_status;

      INSERT INTO public.scheduled_publish_events
        (post_id, scheduled_by, scheduled_for, processed_at, result, reason)
      VALUES (r.id, r.scheduled_by, r.scheduled_at, now(), 'failed', reason);

      failed_count := failed_count + 1;
      CONTINUE;
    END IF;

    PERFORM set_config('app.scheduling_action', 'internal', true);
    UPDATE public.posts
       SET status              = 'publicada'::public.post_status,
           published_at        = now(),
           scheduled_at        = NULL,
           scheduled_by        = NULL,
           scheduled_at_set_at = NULL
     WHERE id = r.id
       AND status = 'aprovada'::public.post_status;

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

-- Endurece a função interna de proteção
REVOKE ALL ON FUNCTION public.protect_scheduled_fields() FROM PUBLIC, anon, authenticated;
