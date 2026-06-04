-- Tabela de fontes de captação
CREATE TABLE IF NOT EXISTS public.news_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('rss', 'site', 'manual')),
  url TEXT,
  default_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  frequency_minutes INTEGER NOT NULL DEFAULT 60 CHECK (frequency_minutes >= 5),
  max_items_per_run INTEGER NOT NULL DEFAULT 10 CHECK (max_items_per_run BETWEEN 1 AND 50),
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  last_run_message TEXT,
  total_captured INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_sources_active_idx ON public.news_sources(is_active, last_run_at);

-- Trigger updated_at
DROP TRIGGER IF EXISTS news_sources_updated_at ON public.news_sources;
CREATE TRIGGER news_sources_updated_at
  BEFORE UPDATE ON public.news_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read sources"
  ON public.news_sources FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "admin or editor manage sources"
  ON public.news_sources FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'editor'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'editor'::app_role));

-- Rastreabilidade em posts
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES public.news_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE INDEX IF NOT EXISTS posts_source_id_idx ON public.posts(source_id);
CREATE UNIQUE INDEX IF NOT EXISTS posts_source_external_unique
  ON public.posts(source_id, external_id)
  WHERE source_id IS NOT NULL AND external_id IS NOT NULL;