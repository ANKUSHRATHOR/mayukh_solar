-- Payments module.
--
-- `project_payments` could only ever describe money that was already tied to a
-- known project, and the only way to reach it was a dialog inside the project
-- page. Two things follow from that: money collected before anyone knows which
-- project it belongs to had nowhere to go, and there was no cross-project
-- answer to "who still owes us".
--
-- This migration adds:
--   * unallocated payments — a row with no project, sitting in an inbox until
--     someone matches it, or flagged `no_project_needed` for general income;
--   * authorship and an updated_at trigger, so an edit leaves a trace;
--   * `payments_list` / `project_dues` views for the new list page;
--   * `net_meter_installed_at`, which starts the collection clock.
--
-- Deliberately NOT touching `milestone`: the quotation document still reads the
-- schedule (src/lib/quotationDocument.ts), but the payments UI works on plain
-- totals — balance is final_amount minus completed receipts, nothing more.

-- ---------------------------------------------------------------------------
-- project_payments: unallocated rows, authorship, updated_at
-- ---------------------------------------------------------------------------

-- A payment can now be logged the moment cash arrives, before anyone knows
-- which project it belongs to.
ALTER TABLE public.project_payments
  ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE public.project_payments
  ADD COLUMN IF NOT EXISTS no_project_needed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payer_name text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

ALTER TABLE public.project_payments
  ALTER COLUMN created_by SET DEFAULT auth.uid();

-- "General income" and "belongs to a project" are mutually exclusive claims.
-- Without this, a row could be linked and still hide from the inbox.
ALTER TABLE public.project_payments
  DROP CONSTRAINT IF EXISTS project_payments_allocation_check;
ALTER TABLE public.project_payments
  ADD CONSTRAINT project_payments_allocation_check
  CHECK (NOT (no_project_needed AND project_id IS NOT NULL));

COMMENT ON COLUMN public.project_payments.no_project_needed IS
  'True for genuine general income that will never belong to a project. Keeps the row out of the unallocated inbox.';
COMMENT ON COLUMN public.project_payments.payer_name IS
  'Who paid. Only meaningful when project_id is NULL — otherwise the project''s customer is the payer.';

-- The table has carried an updated_at column since 20260705040000 but nothing
-- ever advanced it.
DROP TRIGGER IF EXISTS update_project_payments_updated_at ON public.project_payments;
CREATE TRIGGER update_project_payments_updated_at
  BEFORE UPDATE ON public.project_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The inbox query: unlinked, not yet dismissed as general income.
CREATE INDEX IF NOT EXISTS idx_project_payments_unallocated
  ON public.project_payments (created_at DESC)
  WHERE project_id IS NULL AND no_project_needed = false;

CREATE INDEX IF NOT EXISTS idx_project_payments_date
  ON public.project_payments (payment_date DESC);

-- ---------------------------------------------------------------------------
-- projects: when the work finished
-- ---------------------------------------------------------------------------
--
-- The collection clock starts when the plant is live and handed over, i.e. the
-- `net_meter_installed` stage. It cannot start at `project_completed`:
-- can_advance_project (20260719000100) refuses that stage unless the project is
-- already fully paid, so a "completed project with money outstanding" does not
-- exist by construction and the dues list would always be empty.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS net_meter_installed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_due_notified_at timestamptz;

COMMENT ON COLUMN public.projects.net_meter_installed_at IS
  'First time this project reached net_meter_installed. Start of the payment collection window.';
COMMENT ON COLUMN public.projects.payment_due_notified_at IS
  'Last time admins were pushed an overdue-payment reminder for this project. Stops a daily repeat.';

-- `completed_at` has existed since the original schema and was never written by
-- anything — no trigger, no client code — which quietly made
-- projects_kpis.completed_this_month permanently zero. Stamped here too.
CREATE OR REPLACE FUNCTION public.stamp_project_stage_timestamps()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- "or later" rather than equality, so a project that jumps straight to
    -- payment_pending still starts its clock.
    IF NEW.status::text IN (
         'net_meter_installed', 'payment_pending', 'project_completed', 'closed'
       )
       AND NEW.net_meter_installed_at IS NULL
    THEN
      NEW.net_meter_installed_at := now();
    END IF;

    IF NEW.status::text IN ('project_completed', 'closed')
       AND NEW.completed_at IS NULL
    THEN
      NEW.completed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS stamp_project_stage_timestamps ON public.projects;
CREATE TRIGGER stamp_project_stage_timestamps
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.stamp_project_stage_timestamps();

-- Backfill from the audit trail where a status change was recorded; projects
-- that reached the stage before auditing, or through a path that logged nothing,
-- stay NULL and simply never appear in the dues list. Guessing a date would put
-- a project straight into "overdue" on the strength of an invented timestamp.
UPDATE public.projects p
   SET net_meter_installed_at = src.at
  FROM (
    SELECT al.entity_id::uuid AS project_id, min(al.created_at) AS at
      FROM public.audit_logs al
     WHERE al.entity_type = 'project'
       AND (al.new_value->>'status') IN (
             'net_meter_installed', 'payment_pending', 'project_completed', 'closed'
           )
     GROUP BY al.entity_id
  ) src
 WHERE p.id = src.project_id
   AND p.net_meter_installed_at IS NULL;

UPDATE public.projects p
   SET completed_at = src.at
  FROM (
    SELECT al.entity_id::uuid AS project_id, min(al.created_at) AS at
      FROM public.audit_logs al
     WHERE al.entity_type = 'project'
       AND (al.new_value->>'status') IN ('project_completed', 'closed')
     GROUP BY al.entity_id
  ) src
 WHERE p.id = src.project_id
   AND p.completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_net_meter_installed_at
  ON public.projects (net_meter_installed_at)
  WHERE net_meter_installed_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- How long a customer has to settle up
-- ---------------------------------------------------------------------------

INSERT INTO public.system_configs (key, value)
VALUES ('payment_due_days', '2'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Reads the admin-configured window, falling back to 2 days. STABLE so it is
-- evaluated once per statement rather than once per row.
CREATE OR REPLACE FUNCTION public.payment_due_days()
RETURNS integer LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(
    NULLIF(regexp_replace((SELECT value #>> '{}' FROM public.system_configs WHERE key = 'payment_due_days'), '\D', '', 'g'), ''),
    '2'
  )::integer;
$$;

REVOKE EXECUTE ON FUNCTION public.payment_due_days() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.payment_due_days() TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- Replaces the two policies from 20260719000200. Same shape, plus rules for
-- rows with no project and a split between adding and correcting:
--   admin     — everything, including edits and deletes;
--   operator  — sees and adds everything, including unallocated rows, but
--               cannot alter or destroy a record after the fact;
--   sales     — sees and adds payments on their own projects only, never an
--               unallocated row;
--   everyone else — no rows, no error.

DROP POLICY IF EXISTS "Finance roles manage payments"              ON public.project_payments;
DROP POLICY IF EXISTS "Sales can view payments on their projects"  ON public.project_payments;
DROP POLICY IF EXISTS "Admins manage payments"                     ON public.project_payments;
DROP POLICY IF EXISTS "Finance roles read payments"                ON public.project_payments;
DROP POLICY IF EXISTS "Finance roles add payments"                 ON public.project_payments;
DROP POLICY IF EXISTS "Sales read payments on their projects"      ON public.project_payments;
DROP POLICY IF EXISTS "Sales add payments on their projects"       ON public.project_payments;

CREATE POLICY "Admins manage payments"
  ON public.project_payments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Finance roles read payments"
  ON public.project_payments FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'operator'::app_role));

CREATE POLICY "Finance roles add payments"
  ON public.project_payments FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'operator'::app_role));

CREATE POLICY "Sales read payments on their projects"
  ON public.project_payments FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'sales_person'::app_role)
    AND project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id = project_payments.project_id
         AND p.assigned_sales_person_id = auth.uid()
    )
  );

CREATE POLICY "Sales add payments on their projects"
  ON public.project_payments FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'sales_person'::app_role)
    AND project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id = project_payments.project_id
         AND p.assigned_sales_person_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- payments_list — one flat row per payment, for the list page
-- ---------------------------------------------------------------------------
--
-- The list searches across the customer's K-Number, name and mobile, which live
-- two joins away on `leads`. fetchProjectsPage has to resolve those with a
-- second round trip because PostgREST cannot `or()` across an embedded
-- resource; flattening them into a view means one query and one or() here.
--
-- security_invoker = true, same as leads_list (20260801000000): without it the
-- view runs as its owner and hands every role the company's whole cash position.

CREATE OR REPLACE VIEW public.payments_list
WITH (security_invoker = true) AS
SELECT
  pay.id,
  pay.project_id,
  pay.source,
  pay.amount,
  pay.payment_date,
  pay.payment_mode,
  pay.reference_number,
  pay.status,
  pay.milestone,
  pay.notes,
  pay.payer_name,
  pay.no_project_needed,
  pay.created_by,
  pay.updated_by,
  pay.created_at,
  pay.updated_at,
  -- Which bucket the payments page files this under.
  CASE
    WHEN pay.project_id IS NOT NULL   THEN 'linked'
    WHEN pay.no_project_needed        THEN 'general'
    ELSE                                   'unallocated'
  END AS allocation,
  p.project_code,
  p.final_amount,
  p.payment_type,
  p.status AS project_status,
  p.assigned_sales_person_id,
  -- Identity in the house order: K-Number, then name, then mobile. The project
  -- carries its own K-Number and the lead carries one too; the project's wins.
  COALESCE(p.k_number, l.k_number)          AS k_number,
  COALESCE(l.customer_name, p.consumer_name) AS customer_name,
  l.mobile
FROM public.project_payments pay
LEFT JOIN public.projects p ON p.id = pay.project_id
LEFT JOIN public.leads    l ON l.id = p.lead_id;

REVOKE ALL ON public.payments_list FROM anon;
GRANT SELECT ON public.payments_list TO authenticated;

-- ---------------------------------------------------------------------------
-- project_dues — what is still owed, and how late
-- ---------------------------------------------------------------------------
--
-- A project's money is due within payment_due_days() of the plant going live.
-- Only projects that have reached that point appear here at all.
--
-- The role guard matters: with security_invoker, a caller who cannot read
-- project_payments sees no receipts, so every project would read as fully
-- unpaid and maximally overdue. Roles without payment access get zero rows
-- instead of a fabricated debt list — the same reasoning as projects_kpis
-- returning NULL rather than 0 for its money tiles.

CREATE OR REPLACE VIEW public.project_dues
WITH (security_invoker = true) AS
SELECT
  p.id                                        AS project_id,
  p.project_code,
  p.status                                    AS project_status,
  p.payment_type,
  p.assigned_sales_person_id,
  COALESCE(p.k_number, l.k_number)            AS k_number,
  COALESCE(l.customer_name, p.consumer_name)  AS customer_name,
  l.mobile,
  COALESCE(p.final_amount, 0)                 AS final_amount,
  r.received,
  GREATEST(COALESCE(p.final_amount, 0) - r.received, 0) AS balance,
  p.net_meter_installed_at,
  -- Whole days elapsed, so "2 days" means two full days, not 48 hours to the
  -- minute. The business runs on Asia/Kolkata.
  (
    (now() AT TIME ZONE 'Asia/Kolkata')::date
    - (p.net_meter_installed_at AT TIME ZONE 'Asia/Kolkata')::date
  )                                           AS days_since_net_meter,
  (
    (now() AT TIME ZONE 'Asia/Kolkata')::date
    - (p.net_meter_installed_at AT TIME ZONE 'Asia/Kolkata')::date
  ) - public.payment_due_days()               AS days_overdue,
  (
    (
      (now() AT TIME ZONE 'Asia/Kolkata')::date
      - (p.net_meter_installed_at AT TIME ZONE 'Asia/Kolkata')::date
    ) > public.payment_due_days()
  )                                           AS is_overdue
FROM public.projects p
LEFT JOIN public.leads l ON l.id = p.lead_id
CROSS JOIN LATERAL (
  SELECT COALESCE(sum(pay.amount) FILTER (WHERE pay.status = 'completed'), 0) AS received
    FROM public.project_payments pay
   WHERE pay.project_id = p.id
) r
WHERE p.net_meter_installed_at IS NOT NULL
  AND p.status::text <> 'closed'
  AND GREATEST(COALESCE(p.final_amount, 0) - r.received, 0) > 0
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'operator'::app_role)
    OR has_role(auth.uid(), 'sales_person'::app_role)
  );

REVOKE ALL ON public.project_dues FROM anon;
GRANT SELECT ON public.project_dues TO authenticated;

-- ---------------------------------------------------------------------------
-- payments_kpis — the tile row, in one round trip
-- ---------------------------------------------------------------------------
--
-- Same lesson as projects_kpis (20260907000000): a head count per tile on top
-- of the page query is what pushed the leads screen past its statement timeout.
-- SECURITY INVOKER, so every figure is scoped by the caller's own RLS.

CREATE OR REPLACE FUNCTION public.payments_kpis()
RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'received_this_month', (
      SELECT COALESCE(sum(amount), 0) FROM public.project_payments
       WHERE status = 'completed'
         AND payment_date >= date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata'))::date
    ),
    'outstanding',   (SELECT COALESCE(sum(balance), 0) FROM public.project_dues),
    'overdue_amount',(SELECT COALESCE(sum(balance), 0) FROM public.project_dues WHERE is_overdue),
    'overdue_count', (SELECT count(*)                  FROM public.project_dues WHERE is_overdue),
    'unallocated_count', (
      SELECT count(*) FROM public.project_payments
       WHERE project_id IS NULL AND no_project_needed = false
    ),
    'unallocated_amount', (
      SELECT COALESCE(sum(amount), 0) FROM public.project_payments
       WHERE project_id IS NULL AND no_project_needed = false AND status = 'completed'
    ),
    'due_days', public.payment_due_days()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.payments_kpis() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.payments_kpis() TO authenticated;
