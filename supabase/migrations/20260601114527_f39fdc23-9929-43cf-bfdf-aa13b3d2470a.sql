
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS ai_rewrite_quality text NOT NULL DEFAULT 'jornalistica',
  ADD COLUMN IF NOT EXISTS ai_review_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS meta_keywords text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_ai_rewrite_quality_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_ai_rewrite_quality_check
  CHECK (ai_rewrite_quality IN ('basica','jornalistica','premium'));

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_ai_review_status_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_ai_review_status_check
  CHECK (ai_review_status IN ('pendente','reescrito_ia','revisado_editor'));
