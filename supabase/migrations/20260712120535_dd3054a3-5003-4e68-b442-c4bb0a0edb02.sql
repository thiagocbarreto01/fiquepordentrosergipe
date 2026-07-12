ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS previous_content text;
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS recapture_assisted_enabled boolean NOT NULL DEFAULT false;