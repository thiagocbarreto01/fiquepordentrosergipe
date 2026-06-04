-- Adiciona a coluna cover_image_source
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS cover_image_source TEXT;

-- Comentário para documentar os valores possíveis
COMMENT ON COLUMN public.posts.cover_image_source IS 'Origem da imagem: manual, rss, extracted, category_fallback';

-- Atualiza registros existentes com um valor padrão baseado na presença de cover_image_original
UPDATE public.posts 
SET cover_image_source = CASE 
    WHEN cover_image_url IS NULL THEN NULL
    WHEN cover_image_original IS NOT NULL THEN 'rss'
    ELSE 'manual'
END
WHERE cover_image_source IS NULL;
