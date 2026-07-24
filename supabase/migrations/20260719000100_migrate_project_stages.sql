-- Step 2: move live projects onto the new pipeline and rewrite the stage gate.
--
-- Mapping approved by the business owner. Old stages that have no direct
-- equivalent collapse into the nearest new stage that is not ahead of where
-- the work actually is, so no project is advanced past reality.

-- Snapshot before mutating, so the mapping can be audited or reversed.
CREATE TABLE IF NOT EXISTS public.project_status_migration_backup (
  project_id   uuid PRIMARY KEY,
  old_status   text NOT NULL,
  new_status   text NOT NULL,
  migrated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_status_migration_backup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read stage migration backup" ON public.project_status_migration_backup;
CREATE POLICY "Admins read stage migration backup"
  ON public.project_status_migration_backup FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.project_status_migration_backup (project_id, old_status, new_status)
SELECT
  p.id,
  p.status::text,
  CASE p.status::text
    WHEN 'pending_documents'        THEN 'documents_pending'
    WHEN 'pending_operator_review'  THEN 'documents_pending'
    WHEN 'registration_pending'     THEN 'documents_approved'
    WHEN 'registration_done'        THEN 'documents_approved'
    WHEN 'cash_file'                THEN 'documents_approved'
    WHEN 'loan_process'             THEN 'loan_application_pending'
    WHEN 'loan_done'                THEN 'loan_approved'
    WHEN 'material_ordered'         THEN 'installation_scheduled'
    WHEN 'material_dispatched'      THEN 'installation_scheduled'
    WHEN 'material_delivered'       THEN 'installation_scheduled'
    WHEN 'installation_pending'     THEN 'installation_scheduled'
    WHEN 'installation_done'        THEN 'installation_completed'
    WHEN 'wiring_pending'           THEN 'installation_completed'
    WHEN 'wiring_done'              THEN 'installation_completed'
    WHEN 'net_metering_submitted'   THEN 'net_meter_applied'
    WHEN 'inspection_scheduled'     THEN 'net_meter_applied'
    WHEN 'inspection_completed'     THEN 'net_meter_applied'
    WHEN 'inspection_failed'        THEN 'net_meter_applied'
    WHEN 'net_meter_installed'      THEN 'net_meter_installed'
    WHEN 'project_completed'        THEN 'project_completed'
    ELSE p.status::text
  END
FROM public.projects p
ON CONFLICT (project_id) DO NOTHING;

-- The stage gate fires on every status change; it must not block this
-- one-time remap, so disable it for the duration of the UPDATE.
ALTER TABLE public.projects DISABLE TRIGGER trg_enforce_project_stage_gate;

UPDATE public.projects p
   SET status = b.new_status::public.project_status
  FROM public.project_status_migration_backup b
 WHERE b.project_id = p.id
   AND p.status::text <> b.new_status;

ALTER TABLE public.projects ENABLE TRIGGER trg_enforce_project_stage_gate;

-- ---------------------------------------------------------------------------
-- Sub-step tracking for work that is no longer a top-level stage
-- ---------------------------------------------------------------------------

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS welder_work_done_at      timestamptz,
  ADD COLUMN IF NOT EXISTS electrician_work_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS installation_scheduled_for date;

COMMENT ON COLUMN public.projects.welder_work_done_at IS
  'Set when the welder marks structure work complete. Requires an overall_structure photo.';
COMMENT ON COLUMN public.projects.electrician_work_done_at IS
  'Set when the electrician marks wiring complete. Requires a wiring_connection photo.';

-- ---------------------------------------------------------------------------
-- Stage requirements, rewritten for the new pipeline
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.project_stage_requirements(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  p public.projects%ROWTYPE;
  has_docs boolean := false;
  docs_verified boolean := false;
  has_home boolean := false;
  has_serials boolean := false;
  has_dispatch boolean := false;
  welder_assigned boolean := false;
  electrician_assigned boolean := false;
  structure_photo boolean := false;
  wiring_photo boolean := false;
  loan_first_received boolean := false;
  balance_due numeric := 0;
BEGIN
  SELECT * INTO p FROM public.projects WHERE id = _project_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COUNT(*) > 0,
         COALESCE(bool_and(COALESCE(is_verified, false)), false)
    INTO has_docs, docs_verified
  FROM public.documents WHERE project_id = _project_id;

  has_home := p.home_latitude IS NOT NULL AND p.home_longitude IS NOT NULL;

  SELECT EXISTS(SELECT 1 FROM public.serial_numbers WHERE project_id = _project_id)
    INTO has_serials;
  SELECT EXISTS(SELECT 1 FROM public.material_dispatches WHERE project_id = _project_id)
    INTO has_dispatch;

  welder_assigned      := p.assigned_welder_id IS NOT NULL;
  electrician_assigned := p.assigned_electrician_id IS NOT NULL;

  -- Photo proof of completed work, keyed on the document types that already
  -- existed in the enum but had no UI behind them.
  SELECT EXISTS(
    SELECT 1 FROM public.documents
     WHERE project_id = _project_id
       AND document_type = 'overall_structure'
       AND file_url IS NOT NULL
  ) INTO structure_photo;

  SELECT EXISTS(
    SELECT 1 FROM public.documents
     WHERE project_id = _project_id
       AND document_type = 'wiring_connection'
       AND file_url IS NOT NULL
  ) INTO wiring_photo;

  -- Fabrication on a loan file must not start before the bank's first
  -- installment lands.
  SELECT EXISTS(
    SELECT 1 FROM public.project_payments
     WHERE project_id = _project_id
       AND source = 'bank'
       AND status = 'completed'
  ) INTO loan_first_received;

  SELECT COALESCE(p.final_amount, 0) - COALESCE(SUM(pp.amount) FILTER (WHERE pp.status = 'completed'), 0)
    INTO balance_due
  FROM public.project_payments pp
  WHERE pp.project_id = _project_id;

  RETURN jsonb_build_object(
    'documents_uploaded',      has_docs,
    'documents_verified',      docs_verified,
    'home_location_saved',     has_home,
    'serial_numbers_entered',  has_serials,
    'material_dispatched',     has_dispatch,
    'welder_assigned',         welder_assigned,
    'electrician_assigned',    electrician_assigned,
    'welder_work_done',        p.welder_work_done_at IS NOT NULL,
    'electrician_work_done',   p.electrician_work_done_at IS NOT NULL,
    'structure_photo_uploaded', structure_photo,
    'wiring_photo_uploaded',   wiring_photo,
    'loan_first_installment_received', loan_first_received,
    'is_loan',                 p.payment_type = 'loan',
    'balance_due',             COALESCE(balance_due, COALESCE(p.final_amount, 0)),
    'fully_paid',              COALESCE(balance_due, COALESCE(p.final_amount, 0)) <= 0
  );
END $$;

-- ---------------------------------------------------------------------------
-- can_advance_project, rewritten with cash/loan branching
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_advance_project(_project_id uuid, _target project_status)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  r := public.project_stage_requirements(_project_id);
  IF r IS NULL THEN RETURN false; END IF;

  CASE _target::text
    WHEN 'new_project' THEN
      RETURN true;

    WHEN 'documents_pending' THEN
      RETURN true;

    WHEN 'documents_approved' THEN
      RETURN (r->>'documents_uploaded')::boolean
         AND (r->>'documents_verified')::boolean;

    -- Loan-only stages.
    WHEN 'loan_application_pending' THEN
      RETURN (r->>'is_loan')::boolean
         AND (r->>'documents_verified')::boolean;

    WHEN 'loan_approved' THEN
      RETURN (r->>'is_loan')::boolean;

    -- Fabrication gate. A loan file additionally needs the bank's first
    -- installment to have been received.
    WHEN 'installation_scheduled' THEN
      RETURN (r->>'documents_verified')::boolean
         AND (r->>'home_location_saved')::boolean
         AND (
           NOT (r->>'is_loan')::boolean
           OR (r->>'loan_first_installment_received')::boolean
         );

    -- Both trades must have finished AND supplied their photo proof.
    WHEN 'installation_completed' THEN
      RETURN (r->>'welder_work_done')::boolean
         AND (r->>'structure_photo_uploaded')::boolean
         AND (r->>'electrician_work_done')::boolean
         AND (r->>'wiring_photo_uploaded')::boolean;

    WHEN 'net_meter_applied' THEN
      RETURN (r->>'serial_numbers_entered')::boolean;

    WHEN 'net_meter_installed' THEN
      RETURN (r->>'serial_numbers_entered')::boolean;

    WHEN 'payment_pending' THEN
      RETURN true;

    -- A project is not complete while money is outstanding.
    WHEN 'project_completed' THEN
      RETURN (r->>'fully_paid')::boolean;

    WHEN 'closed' THEN
      RETURN (r->>'fully_paid')::boolean;

    ELSE
      -- Legacy stages: permit, so historical rows are never trapped.
      RETURN true;
  END CASE;
END $$;

-- Clearer failure text. The old message named no specific blocker.
CREATE OR REPLACE FUNCTION public.enforce_project_stage_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF has_role(auth.uid(), 'admin'::app_role) THEN
      RETURN NEW;
    END IF;
    IF NOT public.can_advance_project(NEW.id, NEW.status) THEN
      RAISE EXCEPTION
        'Cannot move this project to "%" yet. Open the project checklist to see which requirement is outstanding.',
        NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END $$;
