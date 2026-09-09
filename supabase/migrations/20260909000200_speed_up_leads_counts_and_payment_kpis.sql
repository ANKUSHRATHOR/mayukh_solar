-- Two hot aggregates that were doing far more work than their answers needed.

-- ---------------------------------------------------------------------------
-- leads_stage_counts
-- ---------------------------------------------------------------------------
--
-- It counted over `leads_list`, a view that resolves the latest site visit, the
-- latest project and a quotation flag through three LEFT JOIN LATERALs. At 4000
-- leads that is 12000 correlated subquery executions per call, plus the planning
-- cost of the whole view, to produce eight integers. Measured at 1212ms mean and
-- 7342ms max in production against an 8s statement_timeout on `authenticated`,
-- and 432 seconds of cumulative database time across 357 calls — enough
-- contention to make unrelated queries (including the sign-in role lookup) fail.
--
-- The counts only need `status` and `has_quotation`. Of the derived columns the
-- filters use, `assigned_operator_id`, `project_type` and `last_activity_at` are
-- each needed only when their parameter is supplied, and Postgres short-circuits
-- `_param IS NULL OR ...` at runtime — so on the default view, which is most
-- calls, none of them are evaluated at all.
--
-- Semantics are preserved exactly:
--   * `last_activity_at` used the newest visit_date, which is max(visit_date);
--   * `has_quotation` and the project columns still come from the newest project
--     by updated_at, the same row the view's LATERAL picked.

CREATE OR REPLACE FUNCTION public.leads_stage_counts(
  _search       text        DEFAULT NULL,
  _creator      uuid        DEFAULT NULL,
  _assigned     uuid        DEFAULT NULL,
  _unassigned   boolean     DEFAULT false,
  _operator     uuid        DEFAULT NULL,
  _project_type payment_type DEFAULT NULL,
  _from         timestamptz DEFAULT NULL,
  _to           timestamptz DEFAULT NULL,
  _scope        text        DEFAULT 'all',
  _scope_user   uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'new',            count(*) FILTER (WHERE l.status = 'new'),
    'site_visit',     count(*) FILTER (WHERE l.status = 'visited'),
    'follow_up',      count(*) FILTER (WHERE l.status = 'follow_up'),
    'interested',     count(*) FILTER (WHERE l.status = 'interested'),
    'quotation_sent', count(*) FILTER (WHERE q.has_quotation),
    'final',          count(*) FILTER (WHERE l.status = 'final'),
    'not_interested', count(*) FILTER (WHERE l.status = 'not_interested'),
    'cancelled',      count(*) FILTER (WHERE l.status = 'cancelled')
  )
  FROM public.leads l
  -- Newest project, same row leads_list's LATERAL resolved.
  LEFT JOIN LATERAL (
    SELECT pr.id, pr.assigned_operator_id, pr.payment_type, pr.updated_at
      FROM public.projects pr
     WHERE pr.lead_id = l.id
     ORDER BY pr.updated_at DESC
     LIMIT 1
  ) p ON true
  CROSS JOIN LATERAL (
    SELECT EXISTS (SELECT 1 FROM public.quotations qt WHERE qt.project_id = p.id) AS has_quotation
  ) q
  WHERE l.is_in_bin = false
    AND (
      _search IS NULL OR _search = '' OR
      l.customer_name ILIKE '%' || _search || '%' OR
      l.mobile        ILIKE '%' || _search || '%' OR
      l.k_number      ILIKE '%' || _search || '%'
    )
    AND (_creator      IS NULL OR l.created_by_user_id  = _creator)
    AND (NOT _unassigned OR l.assigned_to_user_id IS NULL)
    AND (_assigned     IS NULL OR l.assigned_to_user_id = _assigned)
    AND (_operator     IS NULL OR p.assigned_operator_id = _operator)
    AND (_project_type IS NULL OR p.payment_type         = _project_type)
    -- The visit lookup only happens when a date filter is actually supplied.
    AND (_from IS NULL OR GREATEST(
          COALESCE((SELECT max(sv.visit_date) FROM public.site_visits sv WHERE sv.lead_id = l.id), l.updated_at, l.created_at),
          COALESCE(p.updated_at, l.updated_at, l.created_at),
          COALESCE(l.updated_at, l.created_at)) >= _from)
    AND (_to   IS NULL OR GREATEST(
          COALESCE((SELECT max(sv.visit_date) FROM public.site_visits sv WHERE sv.lead_id = l.id), l.updated_at, l.created_at),
          COALESCE(p.updated_at, l.updated_at, l.created_at),
          COALESCE(l.updated_at, l.created_at)) <= _to)
    AND (
      _scope <> 'my_visits' OR
      l.assigned_to_user_id = _scope_user OR
      l.created_by_user_id  = _scope_user
    )
    AND (
      _scope <> 'unassigned_visits' OR
      (l.assigned_to_user_id IS NULL AND l.follow_up_date IS NOT NULL)
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.leads_stage_counts(text,uuid,uuid,boolean,uuid,payment_type,timestamptz,timestamptz,text,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.leads_stage_counts(text,uuid,uuid,boolean,uuid,payment_type,timestamptz,timestamptz,text,uuid) TO authenticated;

-- Supports the newest-project lateral and the visit max().
CREATE INDEX IF NOT EXISTS idx_site_visits_lead_date ON public.site_visits (lead_id, visit_date DESC);

-- ---------------------------------------------------------------------------
-- project_dues / payments_kpis
-- ---------------------------------------------------------------------------
--
-- project_dues called payment_due_days() twice per row and evaluated three
-- has_role(auth.uid(), ...) checks per row; payments_kpis then scanned the whole
-- view three times over. Same answers, one scan, with the auth and config
-- lookups lifted into InitPlans.

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
  d.elapsed                                   AS days_since_net_meter,
  d.elapsed - d.due_days                      AS days_overdue,
  d.elapsed > d.due_days                      AS is_overdue
FROM public.projects p
LEFT JOIN public.leads l ON l.id = p.lead_id
CROSS JOIN LATERAL (
  SELECT COALESCE(sum(pay.amount) FILTER (WHERE pay.status = 'completed'), 0) AS received
    FROM public.project_payments pay
   WHERE pay.project_id = p.id
) r
CROSS JOIN LATERAL (
  SELECT
    (SELECT public.payment_due_days()) AS due_days,
    (now() AT TIME ZONE 'Asia/Kolkata')::date
      - (p.net_meter_installed_at AT TIME ZONE 'Asia/Kolkata')::date AS elapsed
) d
WHERE p.net_meter_installed_at IS NOT NULL
  AND p.status::text <> 'closed'
  AND GREATEST(COALESCE(p.final_amount, 0) - r.received, 0) > 0
  AND (SELECT
        has_role((SELECT auth.uid()), 'admin'::app_role)
     OR has_role((SELECT auth.uid()), 'operator'::app_role)
     OR has_role((SELECT auth.uid()), 'sales_person'::app_role));

REVOKE ALL ON public.project_dues FROM anon;
GRANT SELECT ON public.project_dues TO authenticated;

CREATE OR REPLACE FUNCTION public.payments_kpis()
RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public
AS $$
  WITH dues AS MATERIALIZED (
    SELECT balance, is_overdue FROM public.project_dues
  ),
  unallocated AS MATERIALIZED (
    SELECT amount, status FROM public.project_payments
     WHERE project_id IS NULL AND no_project_needed = false
  )
  SELECT jsonb_build_object(
    'received_this_month', (
      SELECT COALESCE(sum(amount), 0) FROM public.project_payments
       WHERE status = 'completed'
         AND payment_date >= date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata'))::date
    ),
    'outstanding',        (SELECT COALESCE(sum(balance), 0) FROM dues),
    'overdue_amount',     (SELECT COALESCE(sum(balance) FILTER (WHERE is_overdue), 0) FROM dues),
    'overdue_count',      (SELECT count(*) FILTER (WHERE is_overdue) FROM dues),
    'unallocated_count',  (SELECT count(*) FROM unallocated),
    'unallocated_amount', (SELECT COALESCE(sum(amount) FILTER (WHERE status = 'completed'), 0) FROM unallocated),
    'due_days',           (SELECT public.payment_due_days())
  );
$$;

REVOKE EXECUTE ON FUNCTION public.payments_kpis() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.payments_kpis() TO authenticated;
