-- Payment milestones.
--
-- `project_payments` previously recorded only source/amount/mode, so there was
-- no way to tell which scheduled installment a payment satisfied. Milestones
-- make the schedule explicit and let the stage gate ask "has the bank's first
-- installment landed?".
--
-- Cash schedule:  30% advance → 60% after installation → 10% after commissioning
-- Loan schedule:  customer margin → bank 1st installment → bank final installment

ALTER TABLE public.project_payments
  ADD COLUMN IF NOT EXISTS milestone text;

DROP INDEX IF EXISTS idx_project_payments_project;
CREATE INDEX idx_project_payments_project
  ON public.project_payments(project_id, status);

ALTER TABLE public.project_payments
  DROP CONSTRAINT IF EXISTS project_payments_milestone_check;
ALTER TABLE public.project_payments
  ADD CONSTRAINT project_payments_milestone_check
  CHECK (
    milestone IS NULL OR milestone IN (
      -- cash
      'cash_advance_30',
      'cash_post_installation_60',
      'cash_commissioning_10',
      -- loan
      'loan_customer_margin',
      'loan_bank_first',
      'loan_bank_final',
      -- anything outside the schedule
      'other'
    )
  );

COMMENT ON COLUMN public.project_payments.milestone IS
  'Which scheduled installment this payment satisfies. NULL for payments recorded before milestones existed.';

-- ---------------------------------------------------------------------------
-- Payment summary for a project
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.project_payment_summary(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  p public.projects%ROWTYPE;
  total_due numeric := 0;
  received numeric := 0;
  pending numeric := 0;
BEGIN
  SELECT * INTO p FROM public.projects WHERE id = _project_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  total_due := COALESCE(p.final_amount, 0);

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0),
    COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)
  INTO received, pending
  FROM public.project_payments
  WHERE project_id = _project_id;

  RETURN jsonb_build_object(
    'payment_type',  p.payment_type,
    'total_due',     total_due,
    'received',      received,
    'pending',       pending,
    -- Clamped at zero: an overpayment should not render as negative "due".
    'balance',       GREATEST(total_due - received, 0),
    'overpaid_by',   GREATEST(received - total_due, 0),
    'fully_paid',    received >= total_due AND total_due > 0,
    'milestones_received', (
      SELECT COALESCE(jsonb_agg(DISTINCT milestone), '[]'::jsonb)
      FROM public.project_payments
      WHERE project_id = _project_id
        AND status = 'completed'
        AND milestone IS NOT NULL
    )
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.project_payment_summary(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.project_payment_summary(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Tighten project_payments RLS
--
-- Every policy was previously `USING (true)` for authenticated, so a welder
-- could read, edit or delete payment records. Money is now admin/operator only,
-- with sales able to see (not change) payments on their own projects.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated can view payments"   ON public.project_payments;
DROP POLICY IF EXISTS "Authenticated can insert payments" ON public.project_payments;
DROP POLICY IF EXISTS "Authenticated can update payments" ON public.project_payments;
DROP POLICY IF EXISTS "Authenticated can delete payments" ON public.project_payments;

CREATE POLICY "Finance roles manage payments"
  ON public.project_payments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role));

CREATE POLICY "Sales can view payments on their projects"
  ON public.project_payments FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'sales_person'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id = project_payments.project_id
         AND p.assigned_sales_person_id = auth.uid()
    )
  );
