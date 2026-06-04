INSERT INTO public.categories (name, slug, position, color) VALUES
  ('Polícia',        'policia',        1, '#b91c1c'),
  ('Política',       'politica',       2, '#1e3a8a'),
  ('Sergipe',        'sergipe',        3, '#0f766e'),
  ('Aracaju',        'aracaju',        4, '#0369a1'),
  ('Interior',       'interior',       5, '#65a30d'),
  ('Brasil',         'brasil',         6, '#16a34a'),
  ('Mundo',          'mundo',          7, '#475569'),
  ('Economia',       'economia',       8, '#ca8a04'),
  ('Saúde',          'saude',          9, '#0891b2'),
  ('Educação',       'educacao',      10, '#7c3aed'),
  ('Esportes',       'esportes',      11, '#ea580c'),
  ('Entretenimento', 'entretenimento',12, '#db2777')
ON CONFLICT (slug) DO UPDATE
   SET name = EXCLUDED.name,
       position = EXCLUDED.position,
       color = EXCLUDED.color;