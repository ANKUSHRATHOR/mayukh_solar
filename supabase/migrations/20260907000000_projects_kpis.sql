-- One query for the Projects KPI row instead of six.
--
-- Same lesson as leads_stage_counts (20260802000000): the projects list already
-- fires three separate `count: 'exact'` head requests for its tab badges, and
-- adding a head request per KPI tile would take that to nine scans per render.
-- Eight such scans on the leads screen pushed the `authenticated` role past its
-- 8s statement_timeout and surfaced as random 500s on unrelated endpoints.
-- Conditional aggregation gets every tile from a single scan.
--
-- SECURITY INVOKER (the default — deliberately not DEFINER) so `projects` RLS
-- still applies and a sales person counts only their own rows. Do NOT "fix" a
-- low total by making this DEFINER: that would hand every welder the company's
-- whole receivables position.
--
-- Scope is tab + search only, deliberately NOT the stage filter: the tiles are
-- themselves stage filters, so a tile has to count across stages or clicking it
-- would show fewer rows than it promised.
--
-- Money is the awkward part. `project_payments` is readable by admin and
-- operator, and by a sales person for their own projects (20260719000200) —
-- which is exactly the row set their `projects` RLS already limits them to, so
-- their totals are correct. A telecaller or a worker gets ZERO payment rows and
-- NO error, which would render as a confident "Balance due ₹0" and, worse,
-- would count every loan project as blocked (no visible payment looks like a
-- missing one). Both payment-derived figures return NULL for those callers and
-- the UI drops the tiles rather than showing a wrong number.

CREATE OR REPLACE FUNCTION public.projects_kpis(
  _tab    text DEFAULT 'all',
  _search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH caller AS (
    SELECT (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'operator'::app_role)
      OR has_role(auth.uid(), 'sales_person'::app_role)
    ) AS payments_visible
  ),
  scoped AS (
    SELECT p.id, p.status, p.payment_type, p.final_amount, p.completed_at
    FROM public.projects p
    -- fetchProjectsPage selects `leads!inner(...)`, so a project with no lead
    -- is absent from the list; an outer join here would count invisible rows.
    JOIN public.leads l ON l.id = p.lead_id
    -- Mirrors fetchProjectsPage in src/lib/projects.ts. Every filter there
    -- except `stage` must be reflected here, or a tile will disagree with the
    -- list beneath it.
    WHERE (_tab IS NULL OR _tab = 'all' OR p.payment_type::text = _tab)
      AND (
        _search IS NULL OR _search = '' OR
        p.k_number      ILIKE '%' || _search || '%' OR
        l.k_number      ILIKE '%' || _search || '%' OR
        l.customer_name ILIKE '%' || _search || '%' OR
        l.mobile        ILIKE '%' || _search || '%'
      )
  ),
  received AS (
    SELECT s.id,
           COALESCE(sum(pay.amount) FILTER (WHERE pay.status = 'completed'), 0) AS paid,
           bool_or(pay.status = 'completed' AND pay.milestone = 'loan_bank_first') AS bank_first_in
    FROM scoped s
    LEFT JOIN public.project_payments pay ON pay.project_id = s.id
    GROUP BY s.id
  )
  SELECT jsonb_build_object(
    'payments_visible', (SELECT payments_visible FROM caller),
    'active', (
      SELECT count(*) FROM scoped
      WHERE status::text NOT IN ('project_completed', 'closed')
    ),
    -- The enum still carries the 18 pre-pipeline values Postgres cannot drop
    -- (LEGACY_STAGE_LABELS in src/lib/projectStages.ts), so both spellings are
    -- named here.
    'awaiting_documents', (
      SELECT count(*) FROM scoped
      WHERE status::text IN ('documents_pending', 'pending_documents', 'pending_operator_review')
    ),
    -- The business runs on Asia/Kolkata; a UTC month boundary would put 5.5
    -- hours of completions in the wrong month.
    'completed_this_month', (
      SELECT count(*) FROM scoped
      WHERE status::text = 'project_completed'
        AND completed_at >= (
          date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')) AT TIME ZONE 'Asia/Kolkata'
        )
    ),
    -- Fabrication on a loan file is blocked until the bank's first installment
    -- lands; mirrors canStartFabrication in src/lib/payments.ts.
    'blocked', CASE WHEN (SELECT payments_visible FROM caller) THEN (
      SELECT count(*) FROM scoped s
      JOIN received r ON r.id = s.id
      WHERE s.payment_type::text = 'loan'
        AND COALESCE(r.bank_first_in, false) = false
    ) END,
    -- final_amount is on `projects`, so this one needs no payments access.
    'total_value', (SELECT COALESCE(sum(final_amount), 0) FROM scoped),
    'balance_due', CASE WHEN (SELECT payments_visible FROM caller) THEN (
      SELECT COALESCE(sum(GREATEST(COALESCE(s.final_amount, 0) - r.paid, 0)), 0)
      FROM scoped s
      JOIN received r ON r.id = s.id
      WHERE s.status::text <> 'closed'
    ) END
  );
$$;

REVOKE EXECUTE ON FUNCTION public.projects_kpis(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.projects_kpis(text, text) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_projects_status_payment_type
  ON public.projects (status, payment_type);
CREATE INDEX IF NOT EXISTS idx_projects_completed_at
  ON public.projects (completed_at) WHERE completed_at IS NOT NULL;
