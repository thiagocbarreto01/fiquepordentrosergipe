-- Adiciona coluna source_published_at para guardar a data original da fonte,
-- separada de published_at (data oficial de publicação no TV Barretão).
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS source_published_at timestamptz;

-- Backfill: para todos os posts, guardar a data atual de published_at como source_published_at
UPDATE public.posts
   SET source_published_at = published_at
 WHERE source_published_at IS NULL
   AND published_at IS NOT NULL;

-- Para posts ainda não publicados no painel, limpar published_at
-- (essa coluna passa a representar a publicação interna)
UPDATE public.posts
   SET published_at = NULL
 WHERE status <> 'publicada'::post_status
   AND published_at IS NOT NULL;

-- Índice para ordenação no feed
CREATE INDEX IF NOT EXISTS idx_posts_published_at_desc
  ON public.posts (published_at DESC NULLS LAST);

-- Trigger: ao mudar status para 'publicada', setar published_at = now() se vazio,
-- e preservar source_published_at original.
CREATE OR REPLACE FUNCTION public.set_published_at_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'publicada'::post_status
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_published_at_on_publish ON public.posts;
CREATE TRIGGER trg_set_published_at_on_publish
BEFORE INSERT OR UPDATE OF status ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.set_published_at_on_publish();