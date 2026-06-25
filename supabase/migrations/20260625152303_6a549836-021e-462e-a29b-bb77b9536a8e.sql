
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

ALTER TABLE public.posts        ADD COLUMN IF NOT EXISTS embedding extensions.vector(3072);
ALTER TABLE public.news_events  ADD COLUMN IF NOT EXISTS embedding extensions.vector(3072);
ALTER TABLE public.news_events  ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz;

-- Nota: pgvector HNSW/IVFFlat não indexa dimensões > 2000. Com ~dezenas/centenas de eventos
-- o scan sequencial sobre `news_events.embedding` é trivial (~ms). Se a tabela crescer
-- muito, migrar para halfvec(3072) + HNSW.

CREATE OR REPLACE FUNCTION public.match_event_by_embedding(
  _embedding extensions.vector,
  _threshold double precision DEFAULT 0.78,
  _window    interval         DEFAULT interval '72 hours'
) RETURNS TABLE(event_id uuid, similarity double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT e.id, (1 - (e.embedding <=> _embedding))::double precision AS similarity
    FROM public.news_events e
   WHERE e.embedding IS NOT NULL
     AND e.last_updated_at > now() - _window
     AND (1 - (e.embedding <=> _embedding)) >= _threshold
   ORDER BY e.embedding <=> _embedding ASC
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.attach_post_to_event_with_embedding(
  _post_id  uuid,
  _embedding extensions.vector,
  _threshold double precision DEFAULT 0.78
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  p RECORD;
  match_event uuid;
  match_sim   double precision;
  new_event   uuid;
  base_slug   text;
  final_slug  text;
  i int := 0;
BEGIN
  SELECT id, title, slug, category_id, tags, COALESCE(ai_entities,'{}'::text[]) AS entities
    INTO p FROM public.posts WHERE id = _post_id;
  IF NOT FOUND OR p.title IS NULL THEN RETURN NULL; END IF;

  -- Cache do vetor no próprio post para reuso futuro
  UPDATE public.posts SET embedding = _embedding WHERE id = _post_id;

  SELECT m.event_id, m.similarity
    INTO match_event, match_sim
    FROM public.match_event_by_embedding(_embedding, _threshold) m;

  IF match_event IS NOT NULL THEN
    UPDATE public.news_events
       SET last_updated_at = now(),
           post_count = post_count + 1,
           entities = ARRAY(SELECT DISTINCT unnest(entities || p.entities)),
           keywords = ARRAY(SELECT DISTINCT unnest(keywords || COALESCE(p.tags,'{}'::text[]))),
           -- atualiza centróide simples: média ponderada com peso 0.85 evento / 0.15 novo
           embedding = (embedding * 0.85 + _embedding * 0.15),
           embedding_updated_at = now()
     WHERE id = match_event;
    UPDATE public.posts        SET event_id = match_event WHERE id = _post_id;
    UPDATE public.posts_public SET event_id = match_event WHERE id = _post_id;
    RETURN match_event;
  END IF;

  base_slug := regexp_replace(lower(coalesce(p.slug, p.title)), '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from substring(base_slug from 1 for 80));
  final_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM public.news_events WHERE slug = final_slug) LOOP
    i := i + 1;
    final_slug := base_slug || '-' || i::text;
  END LOOP;

  INSERT INTO public.news_events (slug, title, category_id, entities, keywords, post_count, last_updated_at, embedding, embedding_updated_at)
  VALUES (final_slug, p.title, p.category_id, p.entities, COALESCE(p.tags,'{}'::text[]), 1, now(), _embedding, now())
  RETURNING id INTO new_event;

  UPDATE public.posts        SET event_id = new_event WHERE id = _post_id;
  UPDATE public.posts_public SET event_id = new_event WHERE id = _post_id;
  RETURN new_event;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_event_by_embedding(extensions.vector, double precision, interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.attach_post_to_event_with_embedding(uuid, extensions.vector, double precision) TO service_role;

-- Gatilho que dispara a Edge Function `cluster-post` ao publicar.
-- Em caso de qualquer falha na invocação, faz fallback para o cluster por trigram já existente.
CREATE OR REPLACE FUNCTION public.trg_cluster_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  fn_url text := 'https://faubrqvkzgyfryfjylnb.supabase.co/functions/v1/cluster-post';
BEGIN
  IF NEW.status = 'publicada'::public.post_status
     AND NEW.event_id IS NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.event_id IS NOT NULL) THEN
    BEGIN
      PERFORM net.http_post(
        url := fn_url,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object('post_id', NEW.id::text)
      );
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        PERFORM public.cluster_post_into_event(NEW.id);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'cluster fallback falhou: %', SQLERRM;
      END;
    END;
  END IF;
  RETURN NEW;
END;
$$;

-- Reclusterização manual de todas as matérias publicadas (apenas staff).
CREATE OR REPLACE FUNCTION public.recluster_all_posts(_force boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  fn_url text := 'https://faubrqvkzgyfryfjylnb.supabase.co/functions/v1/cluster-post';
  r RECORD;
  n int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _force THEN
    UPDATE public.posts        SET event_id = NULL;
    UPDATE public.posts_public SET event_id = NULL;
    DELETE FROM public.news_events;
  END IF;

  FOR r IN
    SELECT id FROM public.posts
     WHERE status = 'publicada'::public.post_status
     ORDER BY published_at ASC NULLS LAST
  LOOP
    BEGIN
      PERFORM net.http_post(
        url := fn_url,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object('post_id', r.id::text, 'force', _force)
      );
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'recluster falhou para %: %', r.id, SQLERRM;
    END;
  END LOOP;

  INSERT INTO public.sync_audit_log (event_type, status, details)
  VALUES ('recluster_all', 'ok', jsonb_build_object('enqueued', n, 'force', _force));

  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recluster_all_posts(boolean) TO authenticated;
