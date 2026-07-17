
-- 1) Estender tabelas de lote com kind + metadata e ampliar ação dos itens
ALTER TABLE public.source_allowed_hosts_batches
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'backfill',
  ADD COLUMN IF NOT EXISTS metadata jsonb;

ALTER TABLE public.source_allowed_hosts_batch_items
  DROP CONSTRAINT IF EXISTS source_allowed_hosts_batch_items_action_check;
ALTER TABLE public.source_allowed_hosts_batch_items
  ADD CONSTRAINT source_allowed_hosts_batch_items_action_check
  CHECK (action = ANY (ARRAY[
    'inserted','conflict','invalid','dry_run',
    'existing','source_updated','host_removed'
  ]));

-- 2) RPC fechada: aplicar a correção F3D.2D (Metrópoles + TJSE)
CREATE OR REPLACE FUNCTION public.admin_apply_correction_f3d2d(_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id uuid := gen_random_uuid();
  v_metro_id constant uuid := '60f21b41-7cd6-4e03-b594-b45b340cceb0';
  v_tjse_id  constant uuid := '867a2f71-e399-4872-9aae-fe9ed218024f';
  v_metro_row public.news_sources%ROWTYPE;
  v_tjse_row  public.news_sources%ROWTYPE;
  v_tjse_new_url  constant text := 'https://agencia.tjse.jus.br/';
  v_tjse_new_type constant text := 'site';
  v_planned jsonb := '[]'::jsonb;
  v_existing jsonb := '[]'::jsonb;
  v_source_update jsonb := '{}'::jsonb;
  v_batch_id uuid;
  v_inserted_count int := 0;
  v_conflict_count int := 0;
  v_updated_sources_count int := 0;
  v_status text;
  r jsonb;
  v_host_id uuid;
  v_exists boolean;
BEGIN
  -- Guard: admin/super_admin only
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Trava anti-concorrência para toda a correção
  PERFORM pg_advisory_xact_lock(hashtext('admin_apply_correction_f3d2d'));

  -- Revalidar identidade dos source_ids
  SELECT * INTO v_metro_row FROM public.news_sources WHERE id = v_metro_id FOR UPDATE;
  SELECT * INTO v_tjse_row  FROM public.news_sources WHERE id = v_tjse_id  FOR UPDATE;
  IF v_metro_row.id IS NULL OR v_metro_row.name NOT ILIKE '%metr%poles%' THEN
    RAISE EXCEPTION 'metropoles_source_mismatch' USING ERRCODE = '22023';
  END IF;
  IF v_tjse_row.id IS NULL OR v_tjse_row.name NOT ILIKE '%tjse%' THEN
    RAISE EXCEPTION 'tjse_source_mismatch' USING ERRCODE = '22023';
  END IF;

  -- Conjunto fechado de inserts previstos
  v_planned := jsonb_build_array(
    jsonb_build_object('source_id', v_metro_id, 'source_name', v_metro_row.name,
                       'hostname','i.metroimg.com','purpose','media','allow_subdomains', false),
    jsonb_build_object('source_id', v_tjse_id,  'source_name', v_tjse_row.name,
                       'hostname','agencia.tjse.jus.br','purpose','feed','allow_subdomains', false),
    jsonb_build_object('source_id', v_tjse_id,  'source_name', v_tjse_row.name,
                       'hostname','agencia.tjse.jus.br','purpose','article','allow_subdomains', false),
    jsonb_build_object('source_id', v_tjse_id,  'source_name', v_tjse_row.name,
                       'hostname','agencia.tjse.jus.br','purpose','media','allow_subdomains', false)
  );

  -- Detectar conflitos (já existentes)
  FOR r IN SELECT value FROM jsonb_array_elements(v_planned) AS value LOOP
    SELECT EXISTS(
      SELECT 1 FROM public.news_source_allowed_hosts
       WHERE source_id = (r->>'source_id')::uuid
         AND hostname  = public.normalize_hostname(r->>'hostname')
         AND purpose   = r->>'purpose'
    ) INTO v_exists;
    IF v_exists THEN
      v_existing := v_existing || jsonb_build_array(r);
      v_conflict_count := v_conflict_count + 1;
    END IF;
  END LOOP;

  v_source_update := jsonb_build_object(
    'source_id', v_tjse_id,
    'before', jsonb_build_object('url', v_tjse_row.url, 'source_type', v_tjse_row.source_type),
    'after',  jsonb_build_object('url', v_tjse_new_url, 'source_type', v_tjse_new_type),
    'changes', (
      CASE WHEN v_tjse_row.url <> v_tjse_new_url THEN 1 ELSE 0 END
      + CASE WHEN v_tjse_row.source_type IS DISTINCT FROM v_tjse_new_type THEN 1 ELSE 0 END
    )
  );

  IF _dry_run THEN
    RETURN jsonb_build_object(
      'success', true,
      'dry_run', true,
      'request_id', v_request_id,
      'planned_inserts', v_planned,
      'existing_conflicts', v_existing,
      'source_update', v_source_update,
      'projected_inserted_count', jsonb_array_length(v_planned) - v_conflict_count,
      'projected_conflict_count', v_conflict_count,
      'projected_updated_sources_count', CASE WHEN (v_source_update->>'changes')::int > 0 THEN 1 ELSE 0 END,
      'rollback_snapshot', jsonb_build_object(
        'tjse_before', v_source_update->'before'
      )
    );
  END IF;

  -- APLICAÇÃO REAL (transacional; erro => rollback total)
  INSERT INTO public.source_allowed_hosts_batches(
    created_by, reference_time, candidate_count,
    inserted_count, conflict_count, invalid_count, status, kind, metadata
  ) VALUES (
    auth.uid(), now(), jsonb_array_length(v_planned),
    0, 0, 0, 'completed', 'correction_f3d2d',
    jsonb_build_object(
      'request_id', v_request_id,
      'source_update_before', v_source_update->'before',
      'source_update_after',  v_source_update->'after'
    )
  ) RETURNING id INTO v_batch_id;

  -- Inserts de hosts
  FOR r IN SELECT value FROM jsonb_array_elements(v_planned) AS value LOOP
    SELECT id INTO v_host_id FROM public.news_source_allowed_hosts
     WHERE source_id = (r->>'source_id')::uuid
       AND hostname  = public.normalize_hostname(r->>'hostname')
       AND purpose   = r->>'purpose';
    IF v_host_id IS NOT NULL THEN
      INSERT INTO public.source_allowed_hosts_batch_items(
        batch_id, allowed_host_id, source_id, hostname, purpose,
        allow_subdomains, action, validation_reason
      ) VALUES (
        v_batch_id, v_host_id, (r->>'source_id')::uuid,
        public.normalize_hostname(r->>'hostname'), r->>'purpose',
        (r->>'allow_subdomains')::boolean, 'existing', 'already_present'
      );
      v_conflict_count := v_conflict_count; -- (already counted)
    ELSE
      INSERT INTO public.news_source_allowed_hosts(source_id, hostname, purpose, allow_subdomains)
      VALUES ((r->>'source_id')::uuid, public.normalize_hostname(r->>'hostname'),
              r->>'purpose', (r->>'allow_subdomains')::boolean)
      RETURNING id INTO v_host_id;

      INSERT INTO public.source_allowed_hosts_batch_items(
        batch_id, allowed_host_id, source_id, hostname, purpose,
        allow_subdomains, action, validation_reason
      ) VALUES (
        v_batch_id, v_host_id, (r->>'source_id')::uuid,
        public.normalize_hostname(r->>'hostname'), r->>'purpose',
        (r->>'allow_subdomains')::boolean, 'inserted', 'correction_f3d2d'
      );
      v_inserted_count := v_inserted_count + 1;
    END IF;
  END LOOP;

  -- Atualização controlada da fonte TJSE (somente URL + tipo)
  IF (v_source_update->>'changes')::int > 0 THEN
    UPDATE public.news_sources
       SET url = v_tjse_new_url,
           source_type = v_tjse_new_type,
           updated_at = now()
     WHERE id = v_tjse_id;

    INSERT INTO public.source_allowed_hosts_batch_items(
      batch_id, source_id, hostname, purpose, allow_subdomains,
      action, validation_reason
    ) VALUES (
      v_batch_id, v_tjse_id, 'agencia.tjse.jus.br', 'feed', false,
      'source_updated',
      (v_source_update)::text
    );
    v_updated_sources_count := 1;
  END IF;

  UPDATE public.source_allowed_hosts_batches
     SET inserted_count = v_inserted_count,
         conflict_count = v_conflict_count
   WHERE id = v_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'dry_run', false,
    'request_id', v_request_id,
    'batch_id', v_batch_id,
    'inserted_count', v_inserted_count,
    'conflict_count', v_conflict_count,
    'updated_sources_count', v_updated_sources_count,
    'status', 'completed'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_apply_correction_f3d2d(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_apply_correction_f3d2d(boolean) TO authenticated;

-- 3) RPC fechada: remover host legado tjse.jus.br/feed após F4 passar
CREATE OR REPLACE FUNCTION public.admin_remove_legacy_tjse_host(_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id uuid := gen_random_uuid();
  v_tjse_id constant uuid := '867a2f71-e399-4872-9aae-fe9ed218024f';
  v_legacy_host constant text := 'tjse.jus.br';
  v_legacy_purpose constant text := 'feed';
  v_new_host constant text := 'agencia.tjse.jus.br';
  v_new_present boolean;
  v_target_id uuid;
  v_batch_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('admin_remove_legacy_tjse_host'));

  SELECT id INTO v_target_id
    FROM public.news_source_allowed_hosts
   WHERE source_id = v_tjse_id AND hostname = v_legacy_host AND purpose = v_legacy_purpose;

  SELECT EXISTS(
    SELECT 1 FROM public.news_source_allowed_hosts
     WHERE source_id = v_tjse_id AND hostname = v_new_host AND purpose = 'feed'
  ) INTO v_new_present;

  IF _dry_run THEN
    RETURN jsonb_build_object(
      'success', true,
      'dry_run', true,
      'request_id', v_request_id,
      'legacy_host_present', v_target_id IS NOT NULL,
      'new_host_present', v_new_present,
      'will_remove', (v_target_id IS NOT NULL AND v_new_present),
      'planned_removal', jsonb_build_object(
        'source_id', v_tjse_id, 'hostname', v_legacy_host, 'purpose', v_legacy_purpose
      )
    );
  END IF;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'legacy_host_not_found' USING ERRCODE = '02000';
  END IF;
  IF NOT v_new_present THEN
    RAISE EXCEPTION 'new_host_not_present_abort' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.source_allowed_hosts_batches(
    created_by, reference_time, candidate_count,
    inserted_count, conflict_count, invalid_count, status, kind, metadata
  ) VALUES (
    auth.uid(), now(), 1, 0, 0, 0, 'completed', 'correction_f3d2d_cleanup',
    jsonb_build_object('request_id', v_request_id, 'removed_host_id', v_target_id)
  ) RETURNING id INTO v_batch_id;

  INSERT INTO public.source_allowed_hosts_batch_items(
    batch_id, allowed_host_id, source_id, hostname, purpose,
    allow_subdomains, action, validation_reason
  ) VALUES (
    v_batch_id, v_target_id, v_tjse_id, v_legacy_host, v_legacy_purpose,
    false, 'host_removed', 'legacy_tjse_replaced_by_agencia'
  );

  DELETE FROM public.news_source_allowed_hosts WHERE id = v_target_id;

  RETURN jsonb_build_object(
    'success', true,
    'dry_run', false,
    'request_id', v_request_id,
    'batch_id', v_batch_id,
    'removed_count', 1,
    'status', 'completed'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_remove_legacy_tjse_host(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_legacy_tjse_host(boolean) TO authenticated;
