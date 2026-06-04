CREATE OR REPLACE FUNCTION public.archive_post(_post_id uuid, _reason text DEFAULT 'manual'::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cur public.post_status;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT status INTO cur FROM public.posts WHERE id = _post_id;
  IF cur IS NULL OR cur = 'arquivada' THEN RETURN; END IF;

  UPDATE public.posts
     SET previous_status = status,
         status = 'arquivada',
         archived_at = now(),
         archived_reason = _reason
   WHERE id = _post_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_post(_post_id uuid)
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
     SET status = COALESCE(previous_status, 'em_revisao'::post_status),
         archived_at = NULL,
         archived_reason = NULL,
         previous_status = NULL
   WHERE id = _post_id AND status = 'arquivada';
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_archive_posts()
RETURNS TABLE(archived_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  total integer := 0;
  c integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_approve_publish(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH upd AS (
    UPDATE public.posts
       SET previous_status = status,
           status = 'arquivada',
           archived_at = now(),
           archived_reason = 'auto:captada_30d'
     WHERE status IN ('captada','rascunho')
       AND updated_at < now() - interval '30 days'
       AND COALESCE(is_evergreen,false) = false
       AND COALESCE(is_urgent,false) = false
     RETURNING 1
  ) SELECT count(*) INTO c FROM upd; total := total + COALESCE(c,0);

  WITH upd AS (
    UPDATE public.posts
       SET previous_status = status,
           status = 'arquivada',
           archived_at = now(),
           archived_reason = 'auto:duplicada_15d'
     WHERE status = 'duplicada'
       AND updated_at < now() - interval '15 days'
       AND COALESCE(is_evergreen,false) = false
       AND COALESCE(is_urgent,false) = false
     RETURNING 1
  ) SELECT count(*) INTO c FROM upd; total := total + COALESCE(c,0);

  WITH upd AS (
    UPDATE public.posts
       SET previous_status = status,
           status = 'arquivada',
           archived_at = now(),
           archived_reason = 'auto:rejeitada_15d'
     WHERE status = 'rejeitada'
       AND updated_at < now() - interval '15 days'
       AND COALESCE(is_evergreen,false) = false
       AND COALESCE(is_urgent,false) = false
     RETURNING 1
  ) SELECT count(*) INTO c FROM upd; total := total + COALESCE(c,0);

  WITH upd AS (
    UPDATE public.posts
       SET previous_status = status,
           status = 'arquivada',
           archived_at = now(),
           archived_reason = 'auto:em_revisao_60d'
     WHERE status IN ('em_revisao','revisao')
       AND updated_at < now() - interval '60 days'
       AND COALESCE(is_evergreen,false) = false
       AND COALESCE(is_urgent,false) = false
     RETURNING 1
  ) SELECT count(*) INTO c FROM upd; total := total + COALESCE(c,0);

  RETURN QUERY SELECT total;
END;
$function$;