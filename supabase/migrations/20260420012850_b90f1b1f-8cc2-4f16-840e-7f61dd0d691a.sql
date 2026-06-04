-- ============================================================
-- 1. MIGRAR DADOS EXISTENTES PARA OS NOVOS STATUS
-- ============================================================
UPDATE public.posts SET status = 'captada'::post_status WHERE status = 'rascunho'::post_status;
UPDATE public.posts SET status = 'em_revisao'::post_status WHERE status = 'revisao'::post_status;
UPDATE public.posts SET status = 'publicada'::post_status WHERE status = 'publicado'::post_status;

-- Default novo: notícia nova entra como "captada"
ALTER TABLE public.posts ALTER COLUMN status SET DEFAULT 'captada'::post_status;

-- ============================================================
-- 2. HISTÓRICO DE STATUS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.post_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  from_status public.post_status,
  to_status public.post_status NOT NULL,
  changed_by UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_status_history_post ON public.post_status_history(post_id, created_at DESC);

ALTER TABLE public.post_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read history" ON public.post_status_history;
CREATE POLICY "staff read history"
  ON public.post_status_history FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff insert history" ON public.post_status_history;
CREATE POLICY "staff insert history"
  ON public.post_status_history FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_post_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.post_status_history (post_id, from_status, to_status, changed_by)
    VALUES (NEW.id, NULL, NEW.status, COALESCE(auth.uid(), NEW.author_id));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.post_status_history (post_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, COALESCE(auth.uid(), NEW.author_id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_post_status_change ON public.posts;
CREATE TRIGGER trg_log_post_status_change
AFTER INSERT OR UPDATE OF status ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.log_post_status_change();

-- ============================================================
-- 3. RLS DE POSTS — só "publicada" é pública
-- ============================================================
DROP POLICY IF EXISTS "published posts public" ON public.posts;
CREATE POLICY "published posts public"
  ON public.posts FOR SELECT
  TO public
  USING (status = 'publicada'::post_status);

-- Helper: editor ou admin
CREATE OR REPLACE FUNCTION public.can_approve_publish(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'editor'::app_role)
      OR public.has_role(_user_id, 'admin'::app_role);
$$;

-- Apenas editor/admin podem mover para aprovada/publicada/rejeitada
DROP POLICY IF EXISTS "author or editor updates" ON public.posts;
CREATE POLICY "author or editor updates"
  ON public.posts FOR UPDATE
  TO authenticated
  USING (
    (auth.uid() = author_id) OR public.can_approve_publish(auth.uid())
  )
  WITH CHECK (
    (status NOT IN ('aprovada'::post_status, 'publicada'::post_status, 'rejeitada'::post_status))
    OR public.can_approve_publish(auth.uid())
  );

-- ============================================================
-- 4. SEGURANÇA: profiles só autenticado
-- ============================================================
DROP POLICY IF EXISTS "profiles public read" ON public.profiles;
CREATE POLICY "profiles authenticated read"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 5. SEGURANÇA: banners — view pública sem analytics
-- ============================================================
CREATE OR REPLACE VIEW public.banners_public
WITH (security_invoker = true) AS
SELECT id, name, sponsor, image_url, link_url, position, is_active, starts_at, ends_at
FROM public.banners
WHERE is_active = true;

GRANT SELECT ON public.banners_public TO anon, authenticated;

DROP POLICY IF EXISTS "active banners public" ON public.banners;
CREATE POLICY "admin read banners full"
  ON public.banners FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 6. SEGURANÇA: denúncias anônimas não armazenam contato
-- ============================================================
DROP POLICY IF EXISTS "anyone submits denuncia" ON public.denuncias;
CREATE POLICY "anyone submits denuncia"
  ON public.denuncias FOR INSERT
  TO public
  WITH CHECK (
    char_length(title) BETWEEN 5 AND 200
    AND char_length(description) BETWEEN 10 AND 5000
    AND status = 'nova'::denuncia_status
    AND (
      is_anonymous = false
      OR (contact_name IS NULL AND contact_phone IS NULL AND contact_email IS NULL)
    )
  );