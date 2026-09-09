-- Tell the caller whether these figures mean anything.
--
-- project_payments admits admin, operator and sales-on-own. Every other role
-- reads zero rows, and this function happily returned a tidy row of zeroes for
-- them, which the UI rendered as fact: "Outstanding ₹0" reads as "nothing is
-- owed", not "you cannot see this". Its sibling projects_kpis already solved
-- this by returning payments_visible and letting the UI drop the tiles
-- (20260907000000), so follow that rather than invent a second convention.
--
-- The payments module now keeps those roles off the page entirely, but an admin
-- can grant the module in Roles & Access, and the figures must stay honest when
-- they do.

CREATE OR REPLACE FUNCTION public.payments_kpis()
RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public
AS $$
  WITH caller AS (
    SELECT (
      has_role((SELECT auth.uid()), 'admin'::app_role)
      OR has_role((SELECT auth.uid()), 'operator'::app_role)
      OR has_role((SELECT auth.uid()), 'sales_person'::app_role)
    ) AS payments_visible
  ),
  dues AS MATERIALIZED (
    SELECT balance, is_overdue FROM public.project_dues
  ),
  unallocated AS MATERIALIZED (
    SELECT amount, status FROM public.project_payments
     WHERE project_id IS NULL AND no_project_needed = false
  )
  SELECT jsonb_build_object(
    'payments_visible', (SELECT payments_visible FROM caller),
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
