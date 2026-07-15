-- 1) Remove coluna sensível de posts_public
ALTER TABLE public.posts_public DROP COLUMN IF EXISTS pinned_reason;

-- 2) Ajusta pin_post_to_home para NÃO escrever pinned_reason em posts_public
CREATE OR REPLACE FUNCTION public.pin_post_to_home(_post_id uuid, _hours integer, _reason text, _slot text DEFAULT 'manchete'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         pinned_slot = _slot
   WHERE id = _post_id;
END;
$function$;

-- 3) Ajusta unpin_post_from_home
CREATE OR REPLACE FUNCTION public.unpin_post_from_home(_post_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.posts
     SET pinned_until = NULL, pinned_slot = NULL, pinned_reason = NULL, pinned_by = NULL
   WHERE id = _post_id;
  UPDATE public.posts_public
     SET pinned_until = NULL, pinned_slot = NULL
   WHERE id = _post_id;
END;
$function$;

-- 4) Garante que anon/PUBLIC não têm EXECUTE nas RPCs
REVOKE EXECUTE ON FUNCTION public.pin_post_to_home(uuid, integer, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unpin_post_from_home(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pin_post_to_home(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpin_post_from_home(uuid) TO authenticated;