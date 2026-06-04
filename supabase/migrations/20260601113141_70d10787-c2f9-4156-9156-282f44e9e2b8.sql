-- 1) Novo valor do enum post_status: arquivada
ALTER TYPE public.post_status ADD VALUE IF NOT EXISTS 'arquivada';

-- 2) Colunas de arquivamento em posts
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text,
  ADD COLUMN IF NOT EXISTS previous_status public.post_status;

CREATE INDEX IF NOT EXISTS idx_posts_archived_at ON public.posts(archived_at);
CREATE INDEX IF NOT EXISTS idx_posts_status_updated ON public.posts(status, updated_at);

-- 3) Função para arquivar uma notícia (manual ou automaticamente)
CREATE OR REPLACE FUNCTION public.archive_post(_post_id uuid, _reason text DEFAULT 'manual')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur public.post_status;
BEGIN
  SELECT status INTO cur FROM public.posts WHERE id = _post_id;
  IF cur IS NULL OR cur = 'arquivada' THEN RETURN; END IF;

  UPDATE public.posts
     SET previous_status = status,
         status = 'arquivada',
         archived_at = now(),
         archived_reason = _reason
   WHERE id = _post_id;
END;
$$;

-- 4) Função para restaurar
CREATE OR REPLACE FUNCTION public.restore_post(_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.posts
     SET status = COALESCE(previous_status, 'em_revisao'::post_status),
         archived_at = NULL,
         archived_reason = NULL,
         previous_status = NULL
   WHERE id = _post_id AND status = 'arquivada';
END;
$$;

-- 5) Função de arquivamento automático conforme regras
CREATE OR REPLACE FUNCTION public.auto_archive_posts()
RETURNS TABLE(archived_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total integer := 0;
  c integer;
BEGIN
  -- CAPTADA: 30 dias sem movimentação
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

  -- DUPLICADA: 15 dias
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

  -- REJEITADA: 15 dias
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

  -- EM REVISÃO: 60 dias
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
$$;

-- 6) Permissões de execução das RPCs (staff via RLS já controla as tabelas; chamadas vêm autenticadas)
GRANT EXECUTE ON FUNCTION public.archive_post(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_post(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_archive_posts() TO authenticated, service_role;
