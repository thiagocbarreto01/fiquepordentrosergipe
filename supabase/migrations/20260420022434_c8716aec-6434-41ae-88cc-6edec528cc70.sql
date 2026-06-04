-- Adiciona campo para guardar a imagem original extraída do RSS
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS cover_image_original TEXT;

-- Adiciona campo de imagem padrão por categoria
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS default_cover_image_url TEXT;