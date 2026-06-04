
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS excerpt text,
  ADD COLUMN IF NOT EXISTS source_url text;
