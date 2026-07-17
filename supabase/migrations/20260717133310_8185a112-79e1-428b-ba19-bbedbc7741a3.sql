-- Fontes F1: restringir DELETE em news_sources apenas a admin/super_admin
-- Mantém SELECT (staff) e INSERT/UPDATE (admin+editor) inalterados.

DROP POLICY IF EXISTS "admin or editor manage sources" ON public.news_sources;

-- Recria como policies granulares para preservar comportamento atual em SELECT/INSERT/UPDATE
CREATE POLICY "admin or editor insert sources"
ON public.news_sources
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'editor'::public.app_role)
);

CREATE POLICY "admin or editor update sources"
ON public.news_sources
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'editor'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'editor'::public.app_role)
);

-- Exclusão restrita: somente admin (super_admin é resolvido via has_role/is_main_admin em outros pontos;
-- para DELETE físico, exigimos papel admin registrado em user_roles)
CREATE POLICY "admin deletes sources"
ON public.news_sources
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
);