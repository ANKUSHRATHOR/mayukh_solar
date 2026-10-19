-- Feeder name on leads: the electricity feeder the consumer is supplied from.
-- Free text, like `campaign` — feeder names come from DISCOM paperwork and are
-- not a list this app owns.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS feeder_name text;

-- ---------------------------------------------------------------------------
-- leads_list
-- ---------------------------------------------------------------------------
-- `l.*` was expanded when the view was created, so the new column needs a
-- rebuild; REPLACE cannot do it because the column lands mid-list. Same
-- definition as 20260918000300, rebuilt.

DROP VIEW IF EXISTS public.leads_list;

CREATE VIEW public.leads_list
WITH (security_invoker = true) AS
SELECT
  l.*,
  v.staff_id            AS last_visit_staff_id,
  v.visit_notes         AS last_visit_notes,
  v.status_updated_to   AS last_visit_status,
  v.visit_date          AS last_visit_at,
  p.id                  AS project_id,
  p.assigned_operator_id,
  p.payment_type        AS project_type,
  p.status              AS project_status,
  (q.project_id IS NOT NULL) AS has_quotation,
  GREATEST(
    COALESCE(v.visit_date,  l.updated_at, l.created_at),
    COALESCE(p.updated_at,  l.updated_at, l.created_at),
    COALESCE(l.updated_at,  l.created_at)
  ) AS last_activity_at
FROM public.leads l
LEFT JOIN LATERAL (
  SELECT sv.staff_id, sv.visit_notes, sv.status_updated_to, sv.visit_date
  FROM public.site_visits sv
  WHERE sv.lead_id = l.id
  ORDER BY sv.visit_date DESC
  LIMIT 1
) v ON true
LEFT JOIN LATERAL (
  SELECT pr.id, pr.assigned_operator_id, pr.payment_type, pr.status, pr.updated_at
  FROM public.projects pr
  WHERE pr.lead_id = l.id
  ORDER BY pr.updated_at DESC
  LIMIT 1
) p ON true
LEFT JOIN LATERAL (
  SELECT qt.project_id
  FROM public.quotations qt
  WHERE qt.project_id = p.id
  LIMIT 1
) q ON true;

REVOKE ALL ON public.leads_list FROM anon;
GRANT SELECT ON public.leads_list TO authenticated;
