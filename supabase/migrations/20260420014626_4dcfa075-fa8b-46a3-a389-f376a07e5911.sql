
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS titulo_original TEXT,
  ADD COLUMN IF NOT EXISTS conteudo_original TEXT,
  ADD COLUMN IF NOT EXISTS titulo_gerado TEXT,
  ADD COLUMN IF NOT EXISTS conteudo_gerado TEXT,
  ADD COLUMN IF NOT EXISTS resumo_gerado TEXT,
  ADD COLUMN IF NOT EXISTS ai_rewritten_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_version_used TEXT NOT NULL DEFAULT 'original' CHECK (ai_version_used IN ('original', 'gerada'));
