
-- ============================================================
-- FASE 1: GRANTS DATA API (staff-read only)
-- ============================================================
REVOKE ALL ON public.news_source_allowed_hosts        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.source_allowed_hosts_batches     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.source_allowed_hosts_batch_items FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.news_source_allowed_hosts        TO authenticated;
GRANT SELECT ON public.source_allowed_hosts_batches     TO authenticated;
GRANT SELECT ON public.source_allowed_hosts_batch_items TO authenticated;

GRANT ALL ON public.news_source_allowed_hosts        TO service_role;
GRANT ALL ON public.source_allowed_hosts_batches     TO service_role;
GRANT ALL ON public.source_allowed_hosts_batch_items TO service_role;

-- ============================================================
-- FIX: variable shadowing na RPC admin_backfill_source_allowed_hosts
-- Causa raiz do backfill 0/0/0: `UPDATE _cands SET norm_host = norm_host`
-- resolve o RHS como coluna (NULL), não como variável plpgsql homônima.
-- Renomeamos as variáveis para v_norm_host / v_invalid_reason.
-- Também adicionamos `status` e contadores nomeados no JSON de retorno
-- para a UI validar antes de mostrar sucesso.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_backfill_source_allowed_hosts(_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  ref timestamptz := now();
  new_batch_id uuid;
  cand_count int := 0;
  ins_count int := 0;
  conf_count int := 0;
  inv_count int := 0;
  items jsonb;
  cand RECORD;
  v_norm_host text;
  v_invalid_reason text;
  new_row_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(uid, 'admin'::public.app_role) OR public.has_role(uid, 'super_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE _cands ON COMMIT DROP AS
    SELECT c.source_id, c.hostname AS raw_host, c.purpose, c.occurrences,
           NULL::text AS norm_host, NULL::text AS invalid_reason
      FROM public._collect_allowed_host_candidates() c;

  FOR cand IN SELECT ctid, source_id, raw_host, purpose FROM _cands LOOP
    v_invalid_reason := NULL;
    v_norm_host := NULL;
    BEGIN
      v_norm_host := public._validate_allowed_hostname(cand.raw_host);
    EXCEPTION WHEN OTHERS THEN
      v_invalid_reason := SQLERRM;
    END;
    IF cand.purpose NOT IN ('feed','article','media') THEN
      v_invalid_reason := COALESCE(v_invalid_reason, 'invalid_purpose');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.news_sources WHERE id = cand.source_id) THEN
      v_invalid_reason := COALESCE(v_invalid_reason, 'source_not_found');
    END IF;
    UPDATE _cands
       SET norm_host = v_norm_host,
           invalid_reason = v_invalid_reason
     WHERE ctid = cand.ctid;
  END LOOP;

  SELECT count(*) INTO cand_count FROM _cands;

  IF _dry_run THEN
    SELECT jsonb_agg(jsonb_build_object(
             'source_id', source_id,
             'hostname', COALESCE(norm_host, raw_host),
             'purpose', purpose,
             'occurrences', occurrences,
             'action', CASE
                         WHEN invalid_reason IS NOT NULL THEN 'invalid'
                         WHEN EXISTS (
                           SELECT 1 FROM public.news_source_allowed_hosts h
                            WHERE h.source_id = _cands.source_id
                              AND h.hostname = _cands.norm_host
                              AND h.purpose = _cands.purpose
                         ) THEN 'conflict'
                         ELSE 'dry_run'
                       END,
             'validation_reason', invalid_reason
           ))
      INTO items FROM _cands;

    SELECT
      count(*) FILTER (WHERE invalid_reason IS NULL AND NOT EXISTS (
        SELECT 1 FROM public.news_source_allowed_hosts h
         WHERE h.source_id = _cands.source_id AND h.hostname = _cands.norm_host AND h.purpose = _cands.purpose
      )),
      count(*) FILTER (WHERE invalid_reason IS NULL AND EXISTS (
        SELECT 1 FROM public.news_source_allowed_hosts h
         WHERE h.source_id = _cands.source_id AND h.hostname = _cands.norm_host AND h.purpose = _cands.purpose
      )),
      count(*) FILTER (WHERE invalid_reason IS NOT NULL)
    INTO ins_count, conf_count, inv_count
    FROM _cands;

    RETURN jsonb_build_object(
      'dry_run', true,
      'status', 'preview',
      'reference_time', ref,
      'candidates', cand_count,
      'would_insert', ins_count,
      'conflicts', conf_count,
      'invalid', inv_count,
      'items', COALESCE(items, '[]'::jsonb)
    );
  END IF;

  INSERT INTO public.source_allowed_hosts_batches
    (created_by, reference_time, candidate_count, status)
  VALUES (uid, ref, cand_count, 'completed')
  RETURNING id INTO new_batch_id;

  FOR cand IN SELECT * FROM _cands LOOP
    IF cand.invalid_reason IS NOT NULL THEN
      INSERT INTO public.source_allowed_hosts_batch_items
        (batch_id, source_id, hostname, purpose, allow_subdomains, action, validation_reason)
      VALUES (new_batch_id, cand.source_id, cand.raw_host, cand.purpose, false, 'invalid', cand.invalid_reason);
      inv_count := inv_count + 1;
      CONTINUE;
    END IF;

    new_row_id := NULL;
    INSERT INTO public.news_source_allowed_hosts
      (source_id, hostname, purpose, allow_subdomains, created_by)
    VALUES (cand.source_id, cand.norm_host, cand.purpose, false, uid)
    ON CONFLICT (source_id, hostname, purpose) DO NOTHING
    RETURNING id INTO new_row_id;

    IF new_row_id IS NOT NULL THEN
      INSERT INTO public.source_allowed_hosts_batch_items
        (batch_id, allowed_host_id, source_id, hostname, purpose, allow_subdomains, action)
      VALUES (new_batch_id, new_row_id, cand.source_id, cand.norm_host, cand.purpose, false, 'inserted');
      ins_count := ins_count + 1;
    ELSE
      INSERT INTO public.source_allowed_hosts_batch_items
        (batch_id, source_id, hostname, purpose, allow_subdomains, action, validation_reason)
      VALUES (new_batch_id, cand.source_id, cand.norm_host, cand.purpose, false, 'conflict', 'already_exists');
      conf_count := conf_count + 1;
    END IF;
  END LOOP;

  UPDATE public.source_allowed_hosts_batches
     SET inserted_count = ins_count,
         conflict_count = conf_count,
         invalid_count = inv_count
   WHERE id = new_batch_id;

  RETURN jsonb_build_object(
    'dry_run', false,
    'status', 'completed',
    'batch_id', new_batch_id,
    'reference_time', ref,
    'candidates', cand_count,
    'inserted_count', ins_count,
    'conflict_count', conf_count,
    'invalid_count', inv_count
  );
END;
$function$;
