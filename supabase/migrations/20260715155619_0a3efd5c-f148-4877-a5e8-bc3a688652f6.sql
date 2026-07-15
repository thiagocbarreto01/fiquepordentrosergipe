
-- Add pinning fields to posts (safe: nullable, no defaults for existing rows)
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS pinned_until timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_slot text,
  ADD COLUMN IF NOT EXISTS pinned_reason text,
  ADD COLUMN IF NOT EXISTS pinned_by uuid;

ALTER TABLE public.posts_public
  ADD COLUMN IF NOT EXISTS pinned_until timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_slot text,
  ADD COLUMN IF NOT EXISTS pinned_reason text;

CREATE INDEX IF NOT EXISTS idx_posts_pinned_active
  ON public.posts (pinned_slot, pinned_until)
  WHERE pinned_until IS NOT NULL;

-- Secure RPC: pin a post to the home headline for max 24h
CREATE OR REPLACE FUNCTION public.pin_post_to_home(
  _post_id uuid,
  _hours integer,
  _reason text,
  _slot text DEFAULT 'manchete'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_until timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _hours IS NULL OR _hours < 1 OR _hours > 24 THEN
    RAISE EXCEPTION 'invalid duration: 1..24 hours';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason required';
  END IF;
  IF _slot NOT IN ('manchete') THEN
    RAISE EXCEPTION 'invalid slot';
  END IF;

  new_until := now() + make_interval(hours => _hours);

  UPDATE public.posts
     SET pinned_until = new_until,
         pinned_slot = _slot,
         pinned_reason = btrim(_reason),
         pinned_by = auth.uid()
   WHERE id = _post_id
     AND status = 'publicada'::public.post_status;

  UPDATE public.posts_public
     SET pinned_until = new_until,
         pinned_slot = _slot,
         pinned_reason = btrim(_reason)
   WHERE id = _post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unpin_post_from_home(_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.posts
     SET pinned_until = NULL, pinned_slot = NULL, pinned_reason = NULL, pinned_by = NULL
   WHERE id = _post_id;
  UPDATE public.posts_public
     SET pinned_until = NULL, pinned_slot = NULL, pinned_reason = NULL
   WHERE id = _post_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pin_post_to_home(uuid, integer, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unpin_post_from_home(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pin_post_to_home(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpin_post_from_home(uuid) TO authenticated;
