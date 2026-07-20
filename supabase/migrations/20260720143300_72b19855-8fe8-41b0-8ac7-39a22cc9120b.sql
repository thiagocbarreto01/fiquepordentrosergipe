
-- ============================================================
-- SEO Rebuild Automation
-- ============================================================

-- Ensure extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- 1) site_rebuild_settings (singleton)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.site_rebuild_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  enabled boolean NOT NULL DEFAULT false,
  debounce_seconds integer NOT NULL DEFAULT 90 CHECK (debounce_seconds BETWEEN 5 AND 3600),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.site_rebuild_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.site_rebuild_settings TO service_role;
ALTER TABLE public.site_rebuild_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.site_rebuild_settings (id, enabled, debounce_seconds)
VALUES (true, false, 90)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2) site_rebuild_queue
-- ============================================================
CREATE TABLE IF NOT EXISTS public.site_rebuild_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason text NOT NULL CHECK (reason IN ('publish','unpublish','slug_alias','public_update','manual')),
  post_id uuid NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','dispatched','failed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  processing_at timestamptz NULL,
  dispatched_at timestamptz NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  coalesced_count integer NOT NULL DEFAULT 1,
  last_error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.site_rebuild_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.site_rebuild_queue TO service_role;
ALTER TABLE public.site_rebuild_queue ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS site_rebuild_queue_ready_idx
  ON public.site_rebuild_queue (status, available_at)
  WHERE status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS site_rebuild_queue_requested_idx
  ON public.site_rebuild_queue (requested_at DESC);
CREATE INDEX IF NOT EXISTS site_rebuild_queue_post_idx
  ON public.site_rebuild_queue (post_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS site_rebuild_queue_one_pending_idx
  ON public.site_rebuild_queue ((true)) WHERE status = 'pending';

-- ============================================================
-- 3) Reason priority helper
-- ============================================================
CREATE OR REPLACE FUNCTION public._rebuild_reason_priority(_reason text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _reason
    WHEN 'publish' THEN 1
    WHEN 'unpublish' THEN 2
    WHEN 'slug_alias' THEN 3
    WHEN 'public_update' THEN 4
    WHEN 'manual' THEN 5
    ELSE 99
  END;
$$;
REVOKE ALL ON FUNCTION public._rebuild_reason_priority(text) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 4) enqueue_site_rebuild
-- ============================================================
CREATE OR REPLACE FUNCTION public.enqueue_site_rebuild(_reason text, _post_id uuid DEFAULT NULL, _force boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_debounce integer;
  v_existing_id uuid;
  v_existing_reason text;
  v_new_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('site_rebuild_enqueue'));

  SELECT enabled, debounce_seconds INTO v_enabled, v_debounce
  FROM public.site_rebuild_settings WHERE id = true;

  IF NOT COALESCE(v_enabled, false) AND NOT _force THEN
    RETURN NULL;
  END IF;

  IF _reason NOT IN ('publish','unpublish','slug_alias','public_update','manual') THEN
    _reason := 'public_update';
  END IF;

  SELECT id, reason INTO v_existing_id, v_existing_reason
  FROM public.site_rebuild_queue
  WHERE status = 'pending'
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.site_rebuild_queue
    SET
      coalesced_count = coalesced_count + 1,
      available_at = now() + make_interval(secs => COALESCE(v_debounce, 90)),
      reason = CASE
        WHEN public._rebuild_reason_priority(_reason) < public._rebuild_reason_priority(v_existing_reason)
          THEN _reason ELSE v_existing_reason END,
      post_id = COALESCE(post_id, _post_id),
      updated_at = now()
    WHERE id = v_existing_id;
    RETURN v_existing_id;
  END IF;

  INSERT INTO public.site_rebuild_queue (reason, post_id, available_at)
  VALUES (_reason, _post_id, now() + make_interval(secs => COALESCE(v_debounce, 90)))
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_site_rebuild(text, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 5) Trigger on posts (SEO-relevant fields only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_posts_seo_rebuild()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text := NULL;
  v_was_published boolean;
  v_is_published boolean;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status = 'publicada' THEN v_reason := 'publish'; END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      v_was_published := OLD.status = 'publicada';
      v_is_published  := NEW.status = 'publicada';

      IF v_was_published AND NOT v_is_published THEN
        v_reason := 'unpublish';
      ELSIF NOT v_was_published AND v_is_published THEN
        v_reason := 'publish';
      ELSIF v_is_published AND (
        OLD.slug IS DISTINCT FROM NEW.slug
        OR OLD.title IS DISTINCT FROM NEW.title
        OR OLD.subtitle IS DISTINCT FROM NEW.subtitle
        OR OLD.meta_title IS DISTINCT FROM NEW.meta_title
        OR OLD.meta_description IS DISTINCT FROM NEW.meta_description
        OR OLD.cover_image_url IS DISTINCT FROM NEW.cover_image_url
        OR OLD.manual_image_url IS DISTINCT FROM NEW.manual_image_url
        OR OLD.category_id IS DISTINCT FROM NEW.category_id
        OR OLD.published_at IS DISTINCT FROM NEW.published_at
      ) THEN
        v_reason := 'public_update';
      END IF;
    ELSIF TG_OP = 'DELETE' THEN
      IF OLD.status = 'publicada' THEN v_reason := 'unpublish'; END IF;
    END IF;

    IF v_reason IS NOT NULL THEN
      PERFORM public.enqueue_site_rebuild(v_reason, COALESCE(NEW.id, OLD.id), false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Never break editorial operations because of automation
    NULL;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.tg_posts_seo_rebuild() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_posts_seo_rebuild ON public.posts;
CREATE TRIGGER trg_posts_seo_rebuild
AFTER INSERT OR UPDATE OR DELETE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.tg_posts_seo_rebuild();

-- ============================================================
-- 6) claim / mark dispatched / mark failed
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_next_site_rebuild()
RETURNS TABLE(id uuid, reason text, post_id uuid, attempt_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('site_rebuild_claim'));

  RETURN QUERY
  WITH picked AS (
    SELECT q.id
    FROM public.site_rebuild_queue q
    WHERE q.status = 'pending'
      AND q.available_at <= now()
    ORDER BY q.available_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  ),
  upd AS (
    UPDATE public.site_rebuild_queue q
    SET status = 'processing',
        processing_at = now(),
        attempt_count = q.attempt_count + 1,
        updated_at = now()
    FROM picked
    WHERE q.id = picked.id
    RETURNING q.id, q.reason, q.post_id, q.attempt_count
  )
  SELECT * FROM upd;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_next_site_rebuild() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_site_rebuild_dispatched(_queue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.site_rebuild_queue
  SET status = 'dispatched',
      dispatched_at = now(),
      last_error_code = NULL,
      updated_at = now()
  WHERE id = _queue_id;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_site_rebuild_dispatched(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_site_rebuild_failed(_queue_id uuid, _error_code text, _retryable boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts integer;
  v_backoff integer;
BEGIN
  SELECT attempt_count INTO v_attempts
  FROM public.site_rebuild_queue WHERE id = _queue_id;

  IF NOT _retryable OR v_attempts >= 3 THEN
    UPDATE public.site_rebuild_queue
    SET status = 'failed',
        last_error_code = substr(COALESCE(_error_code,'unknown'), 1, 64),
        updated_at = now()
    WHERE id = _queue_id;
    RETURN;
  END IF;

  v_backoff := CASE v_attempts WHEN 1 THEN 120 WHEN 2 THEN 300 ELSE 900 END;

  UPDATE public.site_rebuild_queue
  SET status = 'pending',
      processing_at = NULL,
      available_at = now() + make_interval(secs => v_backoff),
      last_error_code = substr(COALESCE(_error_code,'unknown'), 1, 64),
      updated_at = now()
  WHERE id = _queue_id;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_site_rebuild_failed(uuid, text, boolean) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 7) Cron token in Vault + verify RPC
-- ============================================================
DO $$
DECLARE
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'seo_rebuild_cron_token' LIMIT 1;
  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'seo_rebuild_cron_token', 'SEO rebuild cron token');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.verify_site_rebuild_cron_token(_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_stored text;
BEGIN
  IF _token IS NULL OR length(_token) < 16 OR length(_token) > 512 THEN
    RETURN false;
  END IF;
  SELECT decrypted_secret INTO v_stored
  FROM vault.decrypted_secrets
  WHERE name = 'seo_rebuild_cron_token' LIMIT 1;
  IF v_stored IS NULL THEN RETURN false; END IF;
  RETURN encode(digest(_token, 'sha256'), 'hex') = encode(digest(v_stored, 'sha256'), 'hex');
END;
$$;
REVOKE ALL ON FUNCTION public.verify_site_rebuild_cron_token(text) FROM PUBLIC, anon, authenticated;
