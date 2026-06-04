
CREATE TABLE public.home_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid,
  action text NOT NULL,
  position text,
  reason text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.home_audit TO authenticated;
GRANT ALL ON public.home_audit TO service_role;

ALTER TABLE public.home_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read home audit" ON public.home_audit
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "staff insert home audit" ON public.home_audit
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND (changed_by IS NULL OR changed_by = auth.uid()));

CREATE INDEX idx_home_audit_created ON public.home_audit (created_at DESC);
