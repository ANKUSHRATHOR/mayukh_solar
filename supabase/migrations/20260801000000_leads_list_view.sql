-- Flattened leads list for server-side pagination.
--
-- The leads screen filters and sorts on values derived from other tables: the
-- most recent site visit, the most recent project, and whether a quotation
-- exists. Those were computed in the browser, which forced the page to load
-- every lead up front — capped at PostgREST's 1000-row default, so any lead
-- past the first thousand was simply unreachable.
--
-- This view resolves the derived values in SQL so the client can filter, sort
-- and page against them directly and fetch only the rows it displays.
--
-- security_invoker = true is essential: without it the view would run as its
-- owner and bypass RLS, exposing every lead to every role. With it, the
-- existing leads policies still apply, so a telecaller sees only the leads they
-- created or were assigned.

CREATE OR REPLACE VIEW public.leads_list
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
  -- Newest of: last visit, last project touch, lead touch. Drives the default
  -- "latest activity" sort and the date filter.
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

-- Supporting indexes for the lateral lookups and the common sorts.
CREATE INDEX IF NOT EXISTS idx_site_visits_lead_visit_date
  ON public.site_visits (lead_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_projects_lead_updated_at
  ON public.projects (lead_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_project_id
  ON public.quotations (project_id);
CREATE INDEX IF NOT EXISTS idx_leads_bin_updated_at
  ON public.leads (is_in_bin, updated_at DESC);

-- ---------------------------------------------------------------------------
-- Bulk move to the cancelled bin
-- ---------------------------------------------------------------------------
-- Deleting from the list moves a lead to the bin rather than destroying it, so
-- it stays recoverable from the Cancelled Bin page. Sent as an RPC body rather
-- than a URL filter: a page of 200 ids would make a ~7 KB query string, and an
-- over-long lead_id=in.(...) URL is exactly what broke this screen before.

CREATE OR REPLACE FUNCTION public.bulk_bin_leads(_lead_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  updated int;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only an admin can delete leads.';
  END IF;

  UPDATE public.leads
     SET is_in_bin = true,
         updated_at = now()
   WHERE id = ANY(_lead_ids);

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN jsonb_build_object('updated', updated);
END $$;

REVOKE EXECUTE ON FUNCTION public.bulk_bin_leads(uuid[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.bulk_bin_leads(uuid[]) TO authenticated;
