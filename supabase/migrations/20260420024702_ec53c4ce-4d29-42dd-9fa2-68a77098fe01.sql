-- Restringe leitura e atualização de denúncias a admin/editor apenas
-- (antes: qualquer staff incluindo redator via is_staff)
-- INSERT público permanece inalterado.

DROP POLICY IF EXISTS "staff read denuncias" ON public.denuncias;
DROP POLICY IF EXISTS "staff update denuncias" ON public.denuncias;

CREATE POLICY "admin or editor read denuncias"
ON public.denuncias
FOR SELECT
TO authenticated
USING (public.can_approve_publish(auth.uid()));

CREATE POLICY "admin or editor update denuncias"
ON public.denuncias
FOR UPDATE
TO authenticated
USING (public.can_approve_publish(auth.uid()))
WITH CHECK (public.can_approve_publish(auth.uid()));