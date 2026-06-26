ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS captured_at TIMESTAMP WITH TIME ZONE DEFAULT now();
UPDATE public.posts SET captured_at = created_at WHERE captured_at IS NULL;
CREATE INDEX IF NOT EXISTS posts_captured_at_idx ON public.posts (captured_at DESC);