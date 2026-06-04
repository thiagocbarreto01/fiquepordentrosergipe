
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_main_featured boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_posts_is_main_featured ON public.posts (is_main_featured) WHERE is_main_featured = true;
