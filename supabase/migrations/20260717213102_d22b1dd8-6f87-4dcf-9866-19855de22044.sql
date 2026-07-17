
-- 1) Novos campos
ALTER TABLE public.denuncias
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text,
  ADD COLUMN IF NOT EXISTS previous_status public.denuncia_status,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ip_hash text,
  ADD COLUMN IF NOT EXISTS user_agent_hash text;

-- Constraints defensivos de tamanho
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='denuncias_title_len') THEN
    ALTER TABLE public.denuncias ADD CONSTRAINT denuncias_title_len CHECK (char_length(title) BETWEEN 5 AND 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='denuncias_desc_len') THEN
    ALTER TABLE public.denuncias ADD CONSTRAINT denuncias_desc_len CHECK (char_length(description) BETWEEN 10 AND 5000);
  END IF;
END $$;

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_denuncias_updated_at ON public.denuncias;
CREATE TRIGGER trg_denuncias_updated_at
  BEFORE UPDATE ON public.denuncias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Histórico
CREATE TABLE IF NOT EXISTS public.denuncia_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  denuncia_id uuid NOT NULL REFERENCES public.denuncias(id) ON DELETE CASCADE,
  from_status public.denuncia_status,
  to_status public.denuncia_status NOT NULL,
  note text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_denuncia_history_denuncia ON public.denuncia_status_history(denuncia_id, changed_at DESC);

GRANT SELECT ON public.denuncia_status_history TO authenticated;
GRANT ALL ON public.denuncia_status_history TO service_role;

ALTER TABLE public.denuncia_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read denuncia history" ON public.denuncia_status_history;
CREATE POLICY "staff read denuncia history" ON public.denuncia_status_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'editor'::public.app_role)
      OR public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'super_admin'));

-- 3) Grants e policies em denuncias
REVOKE ALL ON public.denuncias FROM PUBLIC;
REVOKE ALL ON public.denuncias FROM anon;
GRANT SELECT ON public.denuncias TO authenticated;
GRANT ALL ON public.denuncias TO service_role;

DROP POLICY IF EXISTS "submit anonymous or own contact denuncia" ON public.denuncias;
DROP POLICY IF EXISTS "admin or editor read denuncias" ON public.denuncias;
DROP POLICY IF EXISTS "admin or editor update denuncias" ON public.denuncias;
DROP POLICY IF EXISTS "admin delete denuncias" ON public.denuncias;

-- Sem INSERT: apenas service_role (via Edge Function) pode inserir
CREATE POLICY "staff read denuncias" ON public.denuncias
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'editor'::public.app_role)
      OR public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'super_admin'));

-- UPDATE/DELETE direto pelo frontend fica bloqueado; usaremos RPCs SECURITY DEFINER.

-- 4) RPCs auditadas
CREATE OR REPLACE FUNCTION public.denuncia_set_status(_id uuid, _status public.denuncia_status, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cur public.denuncia_status;
BEGIN
  IF uid IS NULL OR NOT (public.has_role(uid,'editor'::public.app_role)
                       OR public.has_role(uid,'admin'::public.app_role)
                       OR public.has_role(uid,'super_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _status = 'arquivada' THEN
    RAISE EXCEPTION 'use denuncia_archive for arquivada' USING ERRCODE='22023';
  END IF;
  SELECT status INTO cur FROM public.denuncias WHERE id=_id FOR UPDATE;
  IF cur IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
  IF cur = _status THEN RETURN; END IF;

  UPDATE public.denuncias SET status=_status, archived_at=NULL, archived_reason=NULL, previous_status=NULL WHERE id=_id;
  INSERT INTO public.denuncia_status_history(denuncia_id, from_status, to_status, note, changed_by)
  VALUES (_id, cur, _status, _note, uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.denuncia_archive(_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cur public.denuncia_status;
BEGIN
  IF uid IS NULL OR NOT (public.has_role(uid,'editor'::public.app_role)
                       OR public.has_role(uid,'admin'::public.app_role)
                       OR public.has_role(uid,'super_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason))<3 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE='22023';
  END IF;
  SELECT status INTO cur FROM public.denuncias WHERE id=_id FOR UPDATE;
  IF cur IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
  IF cur = 'arquivada' THEN RETURN; END IF;

  UPDATE public.denuncias
    SET previous_status=cur, status='arquivada', archived_at=now(), archived_reason=btrim(_reason)
   WHERE id=_id;
  INSERT INTO public.denuncia_status_history(denuncia_id, from_status, to_status, note, changed_by)
  VALUES (_id, cur, 'arquivada', btrim(_reason), uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.denuncia_restore(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  prev public.denuncia_status;
BEGIN
  IF uid IS NULL OR NOT (public.has_role(uid,'editor'::public.app_role)
                       OR public.has_role(uid,'admin'::public.app_role)
                       OR public.has_role(uid,'super_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT previous_status INTO prev FROM public.denuncias WHERE id=_id AND status='arquivada' FOR UPDATE;
  IF prev IS NULL THEN prev := 'nova'; END IF;
  UPDATE public.denuncias
     SET status=prev, archived_at=NULL, archived_reason=NULL, previous_status=NULL
   WHERE id=_id AND status='arquivada';
  INSERT INTO public.denuncia_status_history(denuncia_id, from_status, to_status, changed_by)
  VALUES (_id, 'arquivada', prev, uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.denuncia_delete(_id uuid, _confirm text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT (public.has_role(uid,'admin'::public.app_role) OR public.has_role(uid,'super_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _confirm <> 'EXCLUIR' THEN
    RAISE EXCEPTION 'confirmation required' USING ERRCODE='22023';
  END IF;
  DELETE FROM public.denuncias WHERE id=_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.denuncia_update_notes(_id uuid, _internal_notes text, _assigned_to uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT (public.has_role(uid,'editor'::public.app_role)
                       OR public.has_role(uid,'admin'::public.app_role)
                       OR public.has_role(uid,'super_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.denuncias SET internal_notes=_internal_notes, assigned_to=_assigned_to WHERE id=_id;
END;
$$;

REVOKE ALL ON FUNCTION public.denuncia_set_status(uuid, public.denuncia_status, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.denuncia_archive(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.denuncia_restore(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.denuncia_delete(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.denuncia_update_notes(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.denuncia_set_status(uuid, public.denuncia_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.denuncia_archive(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.denuncia_restore(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.denuncia_delete(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.denuncia_update_notes(uuid, text, uuid) TO authenticated;
