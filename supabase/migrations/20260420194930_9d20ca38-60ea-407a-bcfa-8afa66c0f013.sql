ALTER TABLE public.instagram_posts
  ADD COLUMN IF NOT EXISTS editoria text,
  ADD COLUMN IF NOT EXISTS texto_arte jsonb;