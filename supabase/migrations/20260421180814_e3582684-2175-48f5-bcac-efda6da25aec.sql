-- Update positions of existing categories to make room
UPDATE categories SET position = position + 2 WHERE position >= 3;

-- Insert new categories
INSERT INTO categories (id, name, slug, color, position, default_cover_image_url)
VALUES 
  (gen_random_uuid(), 'Esporte', 'esporte', '#16a34a', 3, 'https://owyonvtzhmmikewknlnm.supabase.co/storage/v1/object/public/media/defaults/category-esporte.jpg'),
  (gen_random_uuid(), 'Aracaju', 'aracaju', '#ea580c', 4, 'https://owyonvtzhmmikewknlnm.supabase.co/storage/v1/object/public/media/defaults/category-aracaju.jpg');
