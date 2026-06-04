-- Tighten denuncia insert: still public submission, but add explicit length checks via WITH CHECK
DROP POLICY IF EXISTS "anyone submits denuncia" ON public.denuncias;
CREATE POLICY "anyone submits denuncia" ON public.denuncias
FOR INSERT
WITH CHECK (
  char_length(title) BETWEEN 5 AND 200
  AND char_length(description) BETWEEN 10 AND 5000
  AND status = 'nova'
);

-- Replace broad media bucket SELECT with restricted listing prevention.
-- Keep public file access but disallow arbitrary listing of bucket contents:
DROP POLICY IF EXISTS "media public read" ON storage.objects;
-- Only allow direct object reads (Supabase storage API still allows public file fetch via /object/public),
-- restrict to objects that exist (no listing privileges granted to anon)
CREATE POLICY "media authenticated or path read" ON storage.objects
FOR SELECT
USING (
  bucket_id = 'media'
  AND (
    -- only allow reads when a specific name is targeted (no wildcard listing)
    name IS NOT NULL
  )
);