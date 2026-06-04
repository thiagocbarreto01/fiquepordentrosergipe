-- Enum de status do Instagram
CREATE TYPE public.instagram_post_status AS ENUM ('pendente', 'aprovado', 'publicado', 'erro');

-- Tabela principal
CREATE TABLE public.instagram_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  image_url TEXT,
  caption TEXT NOT NULL DEFAULT '',
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  status public.instagram_post_status NOT NULL DEFAULT 'pendente',
  error_message TEXT,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_instagram_posts_status ON public.instagram_posts(status);
CREATE INDEX idx_instagram_posts_post_id ON public.instagram_posts(post_id);
CREATE INDEX idx_instagram_posts_created_at ON public.instagram_posts(created_at DESC);

-- Habilita RLS
ALTER TABLE public.instagram_posts ENABLE ROW LEVEL SECURITY;

-- Equipe lê tudo
CREATE POLICY "staff read instagram posts"
ON public.instagram_posts
FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

-- Equipe insere (vinculado ao próprio usuário)
CREATE POLICY "staff insert instagram posts"
ON public.instagram_posts
FOR INSERT
TO authenticated
WITH CHECK (public.is_staff(auth.uid()) AND auth.uid() = created_by);

-- Editor/admin atualiza
CREATE POLICY "editor admin update instagram posts"
ON public.instagram_posts
FOR UPDATE
TO authenticated
USING (public.can_approve_publish(auth.uid()))
WITH CHECK (public.can_approve_publish(auth.uid()));

-- Admin deleta
CREATE POLICY "admin delete instagram posts"
ON public.instagram_posts
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Trigger updated_at
CREATE TRIGGER update_instagram_posts_updated_at
BEFORE UPDATE ON public.instagram_posts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();