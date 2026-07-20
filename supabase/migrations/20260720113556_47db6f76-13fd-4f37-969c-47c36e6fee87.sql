
-- Fix news_sources RLS to include super_admin (was only editor/admin, silently blocking super_admin UPDATEs)
DROP POLICY IF EXISTS "admin or editor update sources" ON public.news_sources;
DROP POLICY IF EXISTS "admin or editor insert sources" ON public.news_sources;
DROP POLICY IF EXISTS "admin deletes sources" ON public.news_sources;

CREATE POLICY "staff editor admin update sources"
  ON public.news_sources
  FOR UPDATE
  TO authenticated
  USING (public.is_editor_or_admin(auth.uid()))
  WITH CHECK (public.is_editor_or_admin(auth.uid()));

CREATE POLICY "staff editor admin insert sources"
  ON public.news_sources
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_editor_or_admin(auth.uid()));

CREATE POLICY "admin or super_admin delete sources"
  ON public.news_sources
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );
