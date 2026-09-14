-- Campaign on leads.
--
-- Leads arrive in batches from marketing campaigns (a Facebook push, a village
-- camp, a purchased list), and nothing on the lead said which one. `campaign`
-- is free text rather than an enum or a lookup table: campaigns are created by
-- whoever runs the next import, and an enum would need a migration for each.
-- The list page offers the existing values back as a filter, which keeps
-- spelling consistent without a separate admin screen.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS campaign text;

CREATE INDEX IF NOT EXISTS idx_leads_campaign
  ON public.leads (campaign)
  WHERE campaign IS NOT NULL;

-- ---------------------------------------------------------------------------
-- leads_list
-- ---------------------------------------------------------------------------
-- `l.*` is expanded when a view is created, so a new column on leads does not
-- appear in the view until it is rebuilt. CREATE OR REPLACE cannot do it either:
-- the new column lands in the middle of the list, and REPLACE only allows
-- appending. Same definition as 20260801000000, rebuilt.

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

-- ---------------------------------------------------------------------------
-- leads_stage_counts gains _campaign
-- ---------------------------------------------------------------------------
-- The stage tallies must agree with the list, so every list filter is also a
-- parameter here. Dropped rather than replaced: adding a parameter would create
-- an overload, and two candidates with all-default arguments are ambiguous to
-- PostgREST. Body otherwise identical to 20260909000200.

DROP FUNCTION IF EXISTS public.leads_stage_counts(text,uuid,uuid,boolean,uuid,payment_type,timestamptz,timestamptz,text,uuid);

CREATE FUNCTION public.leads_stage_counts(
  _search       text        DEFAULT NULL,
  _creator      uuid        DEFAULT NULL,
  _assigned     uuid        DEFAULT NULL,
  _unassigned   boolean     DEFAULT false,
  _operator     uuid        DEFAULT NULL,
  _project_type payment_type DEFAULT NULL,
  _from         timestamptz DEFAULT NULL,
  _to           timestamptz DEFAULT NULL,
  _scope        text        DEFAULT 'all',
  _scope_user   uuid        DEFAULT NULL,
  _campaign     text        DEFAULT NULL
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
    AND (_campaign     IS NULL OR l.campaign             = _campaign)
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

REVOKE EXECUTE ON FUNCTION public.leads_stage_counts(text,uuid,uuid,boolean,uuid,payment_type,timestamptz,timestamptz,text,uuid,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.leads_stage_counts(text,uuid,uuid,boolean,uuid,payment_type,timestamptz,timestamptz,text,uuid,text) TO authenticated;

-- ---------------------------------------------------------------------------
-- lead_campaigns
-- ---------------------------------------------------------------------------
-- The distinct campaign names, for the list filter and the import/create
-- suggestions. SECURITY INVOKER, so RLS on leads decides which names a caller
-- can see — a telecaller is offered only campaigns on their own leads.

CREATE OR REPLACE FUNCTION public.lead_campaigns()
RETURNS SETOF text
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT DISTINCT l.campaign
    FROM public.leads l
   WHERE l.campaign IS NOT NULL
     AND l.campaign <> ''
     AND l.is_in_bin = false
   ORDER BY 1;
$function$;

REVOKE EXECUTE ON FUNCTION public.lead_campaigns() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.lead_campaigns() TO authenticated;
