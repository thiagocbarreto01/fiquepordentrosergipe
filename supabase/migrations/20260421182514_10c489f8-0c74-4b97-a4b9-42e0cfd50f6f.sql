-- Rename Cidades to Municípios
UPDATE public.categories 
SET name = 'Municípios', 
    slug = 'municipios',
    default_cover_image_url = 'https://owyonvtzhmmikewknlnm.supabase.co/storage/v1/object/public/media/defaults/category-municipios.jpg'
WHERE slug = 'cidades';

-- Create Sergipe category if it doesn't exist
INSERT INTO public.categories (name, slug, color, default_cover_image_url, position)
SELECT 'Sergipe', 'sergipe', '#0f766e', 'https://owyonvtzhmmikewknlnm.supabase.co/storage/v1/object/public/media/defaults/category-sergipe.jpg', 7
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE slug = 'sergipe');

-- Update positions based on priority
UPDATE public.categories SET position = 1 WHERE slug = 'denuncias';
UPDATE public.categories SET position = 2 WHERE slug = 'policia';
UPDATE public.categories SET position = 3 WHERE slug = 'politica';
UPDATE public.categories SET position = 4 WHERE slug = 'esporte';
UPDATE public.categories SET position = 5 WHERE slug = 'aracaju';
UPDATE public.categories SET position = 6 WHERE slug = 'municipios';
-- Sergipe is already set to 7
UPDATE public.categories SET position = 8 WHERE slug = 'brasil';
UPDATE public.categories SET position = 9 WHERE slug = 'mundo';
UPDATE public.categories SET position = 10 WHERE slug = 'entretenimento';
UPDATE public.categories SET position = 11 WHERE slug = 'opiniao';
UPDATE public.categories SET position = 12 WHERE slug = 'videos';