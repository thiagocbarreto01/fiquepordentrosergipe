-- Etapa 2 TV Barretão 2.0: IA Editora e Análise de Relevância
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS relevance_score INTEGER,
  ADD COLUMN IF NOT EXISTS relevance_level TEXT,
  ADD COLUMN IF NOT EXISTS relevance_reason TEXT,
  ADD COLUMN IF NOT EXISTS relevance_factors JSONB,
  ADD COLUMN IF NOT EXISTS ai_suggested_placement TEXT,
  ADD COLUMN IF NOT EXISTS ai_suggestion_status TEXT NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS ai_suggestion_decided_by UUID,
  ADD COLUMN IF NOT EXISTS ai_suggestion_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS relevance_analyzed_at TIMESTAMPTZ;

-- Constraints suaves (sem CHECK para permitir flexibilidade futura)
CREATE INDEX IF NOT EXISTS idx_posts_relevance_level ON public.posts(relevance_level);
CREATE INDEX IF NOT EXISTS idx_posts_relevance_score ON public.posts(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_posts_ai_suggestion_status ON public.posts(ai_suggestion_status);