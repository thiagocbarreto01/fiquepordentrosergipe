
CREATE TABLE IF NOT EXISTS public.site_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  site_name text NOT NULL DEFAULT 'Fique Por Dentro Sergipe',
  instagram_handle text DEFAULT '',
  instagram_url text DEFAULT '',
  facebook_url text DEFAULT '',
  threads_url text DEFAULT '',
  whatsapp_url text DEFAULT '',
  youtube_url text DEFAULT '',
  contact_email text DEFAULT 'contato@fiquepordentrose.com',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read site settings"
  ON public.site_settings FOR SELECT
  USING (true);

CREATE POLICY "admin manage site settings"
  ON public.site_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER site_settings_updated_at
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.site_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
