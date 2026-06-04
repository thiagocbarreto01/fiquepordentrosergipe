-- =========================================
-- TV Barretão schema
-- =========================================

-- Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'editor', 'redator');

CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Categories
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Posts
CREATE TYPE public.post_status AS ENUM ('rascunho', 'revisao', 'publicado');

CREATE TABLE public.posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  slug TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  cover_image_url TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  tags TEXT[] DEFAULT '{}',
  status public.post_status NOT NULL DEFAULT 'rascunho',
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_urgent BOOLEAN NOT NULL DEFAULT false,
  is_denuncia BOOLEAN NOT NULL DEFAULT false,
  meta_title TEXT,
  meta_description TEXT,
  views INT NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_posts_status_published ON public.posts(status, published_at DESC);
CREATE INDEX idx_posts_category ON public.posts(category_id);
CREATE INDEX idx_posts_featured ON public.posts(is_featured) WHERE is_featured = true;
CREATE INDEX idx_posts_urgent ON public.posts(is_urgent) WHERE is_urgent = true;

-- Banners (advertising)
CREATE TYPE public.banner_position AS ENUM (
  'top','below_hero','sidebar','between_blocks','in_article','article_end','footer'
);

CREATE TABLE public.banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sponsor TEXT,
  image_url TEXT NOT NULL,
  link_url TEXT,
  position public.banner_position NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  clicks INT NOT NULL DEFAULT 0,
  impressions INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

-- Denuncias (public submissions)
CREATE TYPE public.denuncia_status AS ENUM ('nova','em_apuracao','publicada','arquivada');

CREATE TABLE public.denuncias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  city TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  is_anonymous BOOLEAN NOT NULL DEFAULT true,
  status public.denuncia_status NOT NULL DEFAULT 'nova',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.denuncias ENABLE ROW LEVEL SECURITY;

-- =========================================
-- Functions
-- =========================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','editor','redator')
  );
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_posts_updated BEFORE UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_banners_updated BEFORE UPDATE ON public.banners
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- View counter
CREATE OR REPLACE FUNCTION public.increment_post_views(_post_id UUID)
RETURNS VOID LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.posts SET views = views + 1 WHERE id = _post_id AND status = 'publicado';
$$;

-- =========================================
-- RLS Policies
-- =========================================

-- user_roles
CREATE POLICY "users see own roles" ON public.user_roles
FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles
FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

-- profiles
CREATE POLICY "profiles public read" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "users update own profile" ON public.profiles
FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own profile" ON public.profiles
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- categories: public read, staff manage
CREATE POLICY "categories public read" ON public.categories FOR SELECT USING (true);
CREATE POLICY "staff manage categories" ON public.categories
FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'editor'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'editor'));

-- posts
CREATE POLICY "published posts public" ON public.posts
FOR SELECT USING (status = 'publicado');
CREATE POLICY "staff read all posts" ON public.posts
FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "redator inserts own posts" ON public.posts
FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id AND public.is_staff(auth.uid()));
CREATE POLICY "author or editor updates" ON public.posts
FOR UPDATE TO authenticated USING (
  auth.uid() = author_id OR public.has_role(auth.uid(),'editor') OR public.has_role(auth.uid(),'admin')
);
CREATE POLICY "editor or admin deletes" ON public.posts
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(),'editor') OR public.has_role(auth.uid(),'admin')
);

-- banners: active public read; admin manage
CREATE POLICY "active banners public" ON public.banners
FOR SELECT USING (is_active = true);
CREATE POLICY "admin manage banners" ON public.banners
FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

-- denuncias: anyone can submit; only staff read/manage
CREATE POLICY "anyone submits denuncia" ON public.denuncias
FOR INSERT WITH CHECK (true);
CREATE POLICY "staff read denuncias" ON public.denuncias
FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff update denuncias" ON public.denuncias
FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin delete denuncias" ON public.denuncias
FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- =========================================
-- Seed categories
-- =========================================
INSERT INTO public.categories (name, slug, color, position) VALUES
  ('Política','politica','#1e3a8a',1),
  ('Denúncias','denuncias','#dc2626',2),
  ('Polícia','policia','#0f172a',3),
  ('Brasil','brasil','#0369a1',4),
  ('Mundo','mundo','#1e40af',5),
  ('Cidades','cidades','#0891b2',6),
  ('Entretenimento','entretenimento','#7c3aed',7),
  ('Vídeos','videos','#db2777',8),
  ('Opinião','opiniao','#374151',9);

-- Storage bucket for post images
INSERT INTO storage.buckets (id, name, public) VALUES ('media','media',true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "media public read" ON storage.objects FOR SELECT USING (bucket_id = 'media');
CREATE POLICY "staff upload media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'media' AND public.is_staff(auth.uid()));
CREATE POLICY "staff update media" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'media' AND public.is_staff(auth.uid()));
CREATE POLICY "staff delete media" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'media' AND public.is_staff(auth.uid()));