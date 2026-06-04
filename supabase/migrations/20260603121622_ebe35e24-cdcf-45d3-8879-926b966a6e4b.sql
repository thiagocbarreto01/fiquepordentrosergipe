UPDATE public.posts
   SET main_featured_expires_at = COALESCE(published_at, now()) + interval '24 hours'
 WHERE is_main_featured = true
   AND main_featured_expires_at IS NULL;