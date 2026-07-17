
-- ============================================================
-- F3C.2 — Backfill snapshot & rollback infrastructure
-- ============================================================

-- 1) Batches table
CREATE TABLE IF NOT EXISTS public.source_allowed_hosts_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  reference_time timestamptz NOT NULL,
  candidate_count integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  conflict_count integer NOT NULL DEFAULT 0,
  invalid_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed','dry_run','rolled_back','failed'))
);

REVOKE ALL ON public.source_allowed_hosts_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.source_allowed_hosts_batches TO authenticated;
GRANT ALL ON public.source_allowed_hosts_batches TO service_role;

ALTER TABLE public.source_allowed_hosts_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff can read batches"
  ON public.source_allowed_hosts_batches
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- 2) Batch items table
CREATE TABLE IF NOT EXISTS public.source_allowed_hosts_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.source_allowed_hosts_batches(id) ON DELETE CASCADE,
  allowed_host_id uuid REFERENCES public.news_source_allowed_hosts(id) ON DELETE SET NULL,
  source_id uuid,
  hostname text,
  purpose text,
  allow_subdomains boolean,
  action text NOT NULL CHECK (action IN ('inserted','conflict','invalid','dry_run')),
  validation_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sahbi_batch ON public.source_allowed_hosts_batch_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_sahbi_host ON public.source_allowed_hosts_batch_items(allowed_host_id);

REVOKE ALL ON public.source_allowed_hosts_batch_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.source_allowed_hosts_batch_items TO authenticated;
GRANT ALL ON public.source_allowed_hosts_batch_items TO service_role;

ALTER TABLE public.source_allowed_hosts_batch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff can read batch items"
  ON public.source_allowed_hosts_batch_items
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- 3) Candidate collector (internal helper)
CREATE OR REPLACE FUNCTION public._collect_allowed_host_candidates()
RETURNS TABLE(source_id uuid, hostname text, purpose text, occurrences bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH raw AS (
    SELECT s.id AS source_id, 'feed'::text AS purpose,
           public.normalize_hostname(split_part(split_part(s.url, '://', 2), '/', 1)) AS hostname,
           1::bigint AS occurrences
      FROM public.news_sources s
     WHERE s.url IS NOT NULL AND s.url <> ''
    UNION ALL
    SELECT p.source_id, 'article'::text,
           public.normalize_hostname(split_part(split_part(p.source_url, '://', 2), '/', 1)),
           count(*)::bigint
      FROM public.posts p
     WHERE p.source_url IS NOT NULL AND p.source_url <> '' AND p.source_id IS NOT NULL
     GROUP BY p.source_id, public.normalize_hostname(split_part(split_part(p.source_url, '://', 2), '/', 1))
    UNION ALL
    SELECT p.source_id, 'media'::text,
           public.normalize_hostname(split_part(split_part(p.cover_image_url, '://', 2), '/', 1)),
           count(*)::bigint
      FROM public.posts p
     WHERE p.cover_image_url ILIKE 'http%' AND p.source_id IS NOT NULL
     GROUP BY p.source_id, public.normalize_hostname(split_part(split_part(p.cover_image_url, '://', 2), '/', 1))
    UNION ALL
    SELECT p.source_id, 'media'::text,
           public.normalize_hostname(split_part(split_part(p.cover_image_original, '://', 2), '/', 1)),
           count(*)::bigint
      FROM public.posts p
     WHERE p.cover_image_original ILIKE 'http%' AND p.source_id IS NOT NULL
     GROUP BY p.source_id, public.normalize_hostname(split_part(split_part(p.cover_image_original, '://', 2), '/', 1))
  )
  SELECT source_id, hostname, purpose, sum(occurrences)::bigint
    FROM raw
   WHERE hostname IS NOT NULL AND hostname <> ''
   GROUP BY source_id, hostname, purpose;
$$;

REVOKE EXECUTE ON FUNCTION public._collect_allowed_host_candidates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._collect_allowed_host_candidates() TO authenticated;

-- 4) Backfill RPC (dry-run by default)
CREATE OR REPLACE FUNCTION public.admin_backfill_source_allowed_hosts(_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  norm_host text;
  invalid_reason text;
  new_row_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(uid, 'admin'::public.app_role) OR public.has_role(uid, 'super_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Build validated candidate list
  CREATE TEMP TABLE _cands ON COMMIT DROP AS
    SELECT c.source_id, c.hostname AS raw_host, c.purpose, c.occurrences,
           NULL::text AS norm_host, NULL::text AS invalid_reason
      FROM public._collect_allowed_host_candidates() c;

  -- Normalize + validate each row
  FOR cand IN SELECT ctid, source_id, raw_host, purpose FROM _cands LOOP
    invalid_reason := NULL;
    norm_host := NULL;
    BEGIN
      norm_host := public._validate_allowed_hostname(cand.raw_host);
    EXCEPTION WHEN OTHERS THEN
      invalid_reason := SQLERRM;
    END;
    IF cand.purpose NOT IN ('feed','article','media') THEN
      invalid_reason := COALESCE(invalid_reason, 'invalid_purpose');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.news_sources WHERE id = cand.source_id) THEN
      invalid_reason := COALESCE(invalid_reason, 'source_not_found');
    END IF;
    UPDATE _cands SET norm_host = norm_host, invalid_reason = invalid_reason WHERE ctid = cand.ctid;
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
      'reference_time', ref,
      'candidates', cand_count,
      'would_insert', ins_count,
      'conflicts', conf_count,
      'invalid', inv_count,
      'items', COALESCE(items, '[]'::jsonb)
    );
  END IF;

  -- Real execution: create batch, insert, log
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
    'batch_id', new_batch_id,
    'reference_time', ref,
    'candidates', cand_count,
    'inserted', ins_count,
    'conflicts', conf_count,
    'invalid', inv_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_backfill_source_allowed_hosts(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_backfill_source_allowed_hosts(boolean) TO authenticated;

-- 5) Rollback RPC
CREATE OR REPLACE FUNCTION public.admin_rollback_source_allowed_hosts_batch(_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  removed_n int := 0;
  kept_modified_n int := 0;
  not_found_n int := 0;
  conflicts_untouched_n int := 0;
  it RECORD;
  current_row RECORD;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(uid, 'admin'::public.app_role) OR public.has_role(uid, 'super_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.source_allowed_hosts_batches WHERE id = _batch_id) THEN
    RAISE EXCEPTION 'batch_not_found' USING ERRCODE = 'P0002';
  END IF;

  FOR it IN
    SELECT * FROM public.source_allowed_hosts_batch_items
     WHERE batch_id = _batch_id AND action = 'inserted'
  LOOP
    IF it.allowed_host_id IS NULL THEN
      not_found_n := not_found_n + 1;
      CONTINUE;
    END IF;
    SELECT * INTO current_row FROM public.news_source_allowed_hosts WHERE id = it.allowed_host_id;
    IF NOT FOUND THEN
      not_found_n := not_found_n + 1;
      CONTINUE;
    END IF;
    IF current_row.source_id = it.source_id
       AND current_row.hostname = it.hostname
       AND current_row.purpose = it.purpose
       AND current_row.allow_subdomains = it.allow_subdomains THEN
      DELETE FROM public.news_source_allowed_hosts WHERE id = it.allowed_host_id;
      removed_n := removed_n + 1;
    ELSE
      kept_modified_n := kept_modified_n + 1;
    END IF;
  END LOOP;

  SELECT count(*) INTO conflicts_untouched_n
    FROM public.source_allowed_hosts_batch_items
   WHERE batch_id = _batch_id AND action IN ('conflict','invalid');

  UPDATE public.source_allowed_hosts_batches
     SET status = 'rolled_back'
   WHERE id = _batch_id;

  RETURN jsonb_build_object(
    'batch_id', _batch_id,
    'removed', removed_n,
    'kept_modified', kept_modified_n,
    'not_found', not_found_n,
    'conflicts_untouched', conflicts_untouched_n
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_rollback_source_allowed_hosts_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rollback_source_allowed_hosts_batch(uuid) TO authenticated;
