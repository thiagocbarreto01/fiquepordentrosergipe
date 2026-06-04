
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS similarity_score real,
  ADD COLUMN IF NOT EXISTS similar_to uuid,
  ADD COLUMN IF NOT EXISTS duplicate_match_reason text;

CREATE INDEX IF NOT EXISTS idx_posts_similar_to ON public.posts(similar_to);
CREATE INDEX IF NOT EXISTS idx_posts_duplicate_of ON public.posts(duplicate_of);

CREATE TABLE IF NOT EXISTS public.duplicate_decisions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL,
  reference_post_id uuid,
  decision text NOT NULL CHECK (decision IN ('manter','mesclar','marcar_duplicada')),
  similarity_score real,
  note text,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_duplicate_decisions_post ON public.duplicate_decisions(post_id);
CREATE INDEX IF NOT EXISTS idx_duplicate_decisions_created ON public.duplicate_decisions(created_at);

GRANT SELECT, INSERT ON public.duplicate_decisions TO authenticated;
GRANT ALL ON public.duplicate_decisions TO service_role;

ALTER TABLE public.duplicate_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read duplicate decisions"
  ON public.duplicate_decisions FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "staff insert duplicate decisions"
  ON public.duplicate_decisions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND (decided_by IS NULL OR decided_by = auth.uid()));
