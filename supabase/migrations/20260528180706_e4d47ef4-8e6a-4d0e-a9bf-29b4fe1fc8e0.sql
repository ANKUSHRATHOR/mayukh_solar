
-- 1. Material dispatches table
CREATE TABLE public.material_dispatches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_url TEXT,
  notes TEXT,
  dispatched_by UUID NOT NULL,
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_dispatches TO authenticated;
GRANT ALL ON public.material_dispatches TO service_role;

ALTER TABLE public.material_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/operator manage dispatches"
  ON public.material_dispatches FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'operator'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'operator'::app_role));

CREATE POLICY "Sales view own project dispatches"
  ON public.material_dispatches FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'sales_person'::app_role)
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = material_dispatches.project_id AND p.assigned_sales_person_id = auth.uid())
  );

CREATE INDEX idx_material_dispatches_project ON public.material_dispatches(project_id);

CREATE TRIGGER trg_material_dispatches_updated
  BEFORE UPDATE ON public.material_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('material-dispatch','material-dispatch', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admin/operator manage dispatch files"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id='material-dispatch' AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'operator'::app_role)))
  WITH CHECK (bucket_id='material-dispatch' AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'operator'::app_role)));

CREATE POLICY "Sales view own project dispatch files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id='material-dispatch'
    AND has_role(auth.uid(),'sales_person'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.assigned_sales_person_id = auth.uid()
    )
  );

-- 3. Stage requirements function
CREATE OR REPLACE FUNCTION public.project_stage_requirements(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  p public.projects%ROWTYPE;
  has_docs boolean := false;
  docs_verified boolean := false;
  has_quote boolean := false;
  has_home boolean := false;
  has_serials boolean := false;
  has_dispatch boolean := false;
BEGIN
  SELECT * INTO p FROM public.projects WHERE id = _project_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COUNT(*) > 0,
         COALESCE(bool_and(COALESCE(is_verified, false)), false)
    INTO has_docs, docs_verified
  FROM public.documents WHERE project_id = _project_id;

  SELECT EXISTS(SELECT 1 FROM public.quotations WHERE project_id = _project_id) INTO has_quote;
  has_home := p.home_latitude IS NOT NULL AND p.home_longitude IS NOT NULL;
  SELECT EXISTS(SELECT 1 FROM public.serial_numbers WHERE project_id = _project_id) INTO has_serials;
  SELECT EXISTS(SELECT 1 FROM public.material_dispatches WHERE project_id = _project_id) INTO has_dispatch;

  RETURN jsonb_build_object(
    'documents_uploaded', has_docs,
    'documents_verified', docs_verified,
    'quotation_created', has_quote,
    'home_location_saved', has_home,
    'serial_numbers_entered', has_serials,
    'material_dispatched', has_dispatch
  );
END $$;

-- 4. can_advance_project
CREATE OR REPLACE FUNCTION public.can_advance_project(_project_id uuid, _target project_status)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  r := public.project_stage_requirements(_project_id);
  IF r IS NULL THEN RETURN false; END IF;

  CASE _target
    WHEN 'pending_operator_review' THEN
      RETURN (r->>'documents_uploaded')::boolean;
    WHEN 'registration_pending','registration_done','loan_process','loan_done','cash_file' THEN
      RETURN (r->>'documents_verified')::boolean AND (r->>'quotation_created')::boolean;
    WHEN 'material_ordered','material_dispatched' THEN
      RETURN (r->>'quotation_created')::boolean;
    WHEN 'material_delivered','installation_pending' THEN
      RETURN (r->>'material_dispatched')::boolean AND (r->>'home_location_saved')::boolean;
    WHEN 'installation_done','wiring_pending','wiring_done' THEN
      RETURN (r->>'material_dispatched')::boolean;
    WHEN 'net_metering_submitted','inspection_scheduled','inspection_completed','net_meter_installed','project_completed' THEN
      RETURN (r->>'serial_numbers_entered')::boolean;
    ELSE
      RETURN true;
  END CASE;
END $$;

-- 5. Trigger to enforce on status transitions (admin bypass)
CREATE OR REPLACE FUNCTION public.enforce_project_stage_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF has_role(auth.uid(), 'admin'::app_role) THEN
      RETURN NEW;
    END IF;
    IF NOT public.can_advance_project(NEW.id, NEW.status) THEN
      RAISE EXCEPTION 'Cannot move to % — required artifacts are missing. Check the project checklist.', NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_project_stage_gate ON public.projects;
CREATE TRIGGER trg_enforce_project_stage_gate
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.enforce_project_stage_gate();
