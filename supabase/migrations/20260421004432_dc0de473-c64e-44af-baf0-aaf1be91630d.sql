ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS video_url_principal TEXT,
  ADD COLUMN IF NOT EXISTS videos_relacionados TEXT[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.posts.video_url_principal IS 'Main video URL (YouTube, Instagram, or generic embed) displayed above the cover image.';
COMMENT ON COLUMN public.posts.videos_relacionados IS 'Additional secondary videos displayed below the article content.';