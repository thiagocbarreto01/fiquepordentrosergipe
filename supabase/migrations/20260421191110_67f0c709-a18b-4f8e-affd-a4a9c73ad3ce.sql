-- Drop the view first
DROP VIEW IF EXISTS public.banners_public;

-- Create a temporary type and migrate
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'banner_position') THEN
        -- Create a temporary type
        CREATE TYPE banner_position_new AS ENUM (
            'topo_home',
            'entre_noticias',
            'dentro_materia',
            'final_materia',
            'lateral',
            'mobile_banner',
            'footer'
        );

        -- Add the new column
        ALTER TABLE public.banners ADD COLUMN position_new banner_position_new;

        -- Migrate data
        UPDATE public.banners SET position_new = 
            CASE 
                WHEN position::text = 'top' THEN 'topo_home'::banner_position_new
                WHEN position::text = 'below_hero' THEN 'entre_noticias'::banner_position_new
                WHEN position::text = 'between_blocks' THEN 'entre_noticias'::banner_position_new
                WHEN position::text = 'sidebar' THEN 'lateral'::banner_position_new
                WHEN position::text = 'in_article' THEN 'dentro_materia'::banner_position_new
                WHEN position::text = 'article_end' THEN 'final_materia'::banner_position_new
                WHEN position::text = 'footer' THEN 'footer'::banner_position_new
                ELSE 'entre_noticias'::banner_position_new
            END;

        -- Drop old column and type
        ALTER TABLE public.banners DROP COLUMN position;
        DROP TYPE banner_position;

        -- Rename new column and type
        ALTER TYPE banner_position_new RENAME TO banner_position;
        ALTER TABLE public.banners RENAME COLUMN position_new TO position;
    END IF;
END $$;

-- Recreate the view
CREATE OR REPLACE VIEW public.banners_public AS
 SELECT id,
    name,
    sponsor,
    image_url,
    link_url,
    "position",
    is_active,
    starts_at,
    ends_at
   FROM banners
  WHERE (is_active = true);
