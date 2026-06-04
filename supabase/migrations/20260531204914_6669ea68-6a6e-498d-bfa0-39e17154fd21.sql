ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS home_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_evergreen BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_posts_home_expires_at
  ON public.posts (home_expires_at)
  WHERE home_expires_at IS NOT NULL;

COMMENT ON COLUMN public.posts.home_expires_at IS
  'Data/hora em que a notícia deixa de aparecer na Home e nos destaques. A URL continua ativa e indexável.';
COMMENT ON COLUMN public.posts.is_evergreen IS
  'Quando true, a notícia é destaque permanente e ignora home_expires_at.';