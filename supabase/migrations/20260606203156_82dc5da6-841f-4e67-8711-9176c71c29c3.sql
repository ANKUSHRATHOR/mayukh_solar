CREATE OR REPLACE FUNCTION public.get_last_saved_bike_reading(_staff_user_id uuid, _exclude_attendance_event uuid DEFAULT NULL, _exclude_field_visit uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH readings AS (
    SELECT bike_meter_reading AS reading, captured_at AS happened_at
    FROM public.attendance_events
    WHERE staff_user_id = _staff_user_id
      AND is_rejected = false
      AND bike_meter_reading IS NOT NULL
      AND (_exclude_attendance_event IS NULL OR id <> _exclude_attendance_event)
    UNION ALL
    SELECT bike_meter_reading AS reading, created_at AS happened_at
    FROM public.field_visits
    WHERE staff_user_id = _staff_user_id
      AND bike_meter_reading IS NOT NULL
      AND (_exclude_field_visit IS NULL OR id <> _exclude_field_visit)
  )
  SELECT reading
  FROM readings
  ORDER BY happened_at DESC
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.validate_attendance_bike_reading()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  last_reading numeric;
BEGIN
  IF NEW.is_rejected = true OR NEW.bike_meter_reading IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT public.get_last_saved_bike_reading(NEW.staff_user_id, NEW.id, NULL)
    INTO last_reading;

  IF last_reading IS NOT NULL AND NEW.bike_meter_reading < last_reading THEN
    RAISE EXCEPTION 'Bike reading cannot be lower than the last saved reading (% km).', last_reading;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_field_visit_bike_reading()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  last_reading numeric;
BEGIN
  IF NEW.bike_meter_reading IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT public.get_last_saved_bike_reading(NEW.staff_user_id, NULL, NEW.id)
    INTO last_reading;

  IF last_reading IS NOT NULL AND NEW.bike_meter_reading < last_reading THEN
    RAISE EXCEPTION 'Bike reading cannot be lower than the last saved reading (% km).', last_reading;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_attendance_bike_reading ON public.attendance_events;
CREATE TRIGGER trg_validate_attendance_bike_reading
BEFORE INSERT OR UPDATE ON public.attendance_events
FOR EACH ROW
EXECUTE FUNCTION public.validate_attendance_bike_reading();

DROP TRIGGER IF EXISTS trg_validate_field_visit_bike_reading ON public.field_visits;
CREATE TRIGGER trg_validate_field_visit_bike_reading
BEFORE INSERT OR UPDATE ON public.field_visits
FOR EACH ROW
EXECUTE FUNCTION public.validate_field_visit_bike_reading();

DROP POLICY IF EXISTS "Sales persons can create leads" ON public.leads;
CREATE POLICY "Sales persons can create leads"
ON public.leads
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'sales_person'::app_role)
  AND created_by_user_id = auth.uid()
);

CREATE OR REPLACE FUNCTION public.get_project_timeline(_project_id uuid)
RETURNS TABLE(
  event_key text,
  label text,
  happened_at timestamptz,
  staff_user_id uuid,
  staff_name text,
  staff_role app_role,
  details text,
  sort_order integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p public.projects%ROWTYPE;
BEGIN
  SELECT * INTO p
  FROM public.projects
  WHERE id = _project_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR p.created_by_user_id = auth.uid()
    OR p.assigned_sales_person_id = auth.uid()
    OR p.assigned_operator_id = auth.uid()
    OR p.assigned_welder_id = auth.uid()
    OR p.assigned_electrician_id = auth.uid()
    OR p.assigned_telecaller_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH staff_roles AS (
    SELECT s.user_id, s.full_name, ur.role
    FROM public.staff s
    LEFT JOIN public.user_roles ur ON ur.user_id = s.user_id
  ),
  lead_created AS (
    SELECT
      'lead_created'::text AS event_key,
      'Lead Created'::text AS label,
      l.created_at AS happened_at,
      l.created_by_user_id AS staff_user_id,
      10 AS sort_order,
      'Lead entered into CRM'::text AS details
    FROM public.leads l
    WHERE l.id = p.lead_id
  ),
  first_follow_up AS (
    SELECT
      'follow_up_started'::text AS event_key,
      'Follow-up Started'::text AS label,
      sv.visit_date AS happened_at,
      sv.staff_id AS staff_user_id,
      20 AS sort_order,
      COALESCE(NULLIF(sv.visit_notes, ''), 'Lead moved to follow-up')::text AS details
    FROM public.site_visits sv
    WHERE sv.lead_id = p.lead_id
      AND sv.status_updated_to = 'follow_up'::lead_status
    ORDER BY sv.visit_date ASC
    LIMIT 1
  ),
  first_site_visit AS (
    SELECT
      'site_visit'::text AS event_key,
      'Site Visit'::text AS label,
      sv.visit_date AS happened_at,
      sv.staff_id AS staff_user_id,
      30 AS sort_order,
      COALESCE(NULLIF(sv.visit_notes, ''), 'Site visit recorded')::text AS details
    FROM public.site_visits sv
    WHERE sv.lead_id = p.lead_id
    ORDER BY sv.visit_date ASC
    LIMIT 1
  ),
  documents_collected AS (
    SELECT
      'documents_collected'::text AS event_key,
      'Documents Collected'::text AS label,
      COALESCE(p.documents_submitted_at, d.uploaded_at) AS happened_at,
      d.uploaded_by_user_id AS staff_user_id,
      40 AS sort_order,
      'Consumer documents uploaded'::text AS details
    FROM public.documents d
    WHERE d.project_id = p.id
    ORDER BY COALESCE(p.documents_submitted_at, d.uploaded_at) DESC
    LIMIT 1
  ),
  quotation_generated AS (
    SELECT
      'quotation_generated'::text AS event_key,
      'Quotation Generated'::text AS label,
      q.created_at AS happened_at,
      q.created_by_user_id AS staff_user_id,
      50 AS sort_order,
      COALESCE(q.quotation_number, 'Quotation created')::text AS details
    FROM public.quotations q
    WHERE q.project_id = p.id
    ORDER BY q.created_at ASC
    LIMIT 1
  ),
  status_events AS (
    SELECT
      CASE new_value->>'status'
        WHEN 'loan_process' THEN 'loan_submitted'
        WHEN 'loan_done' THEN 'loan_approved'
        WHEN 'material_ordered' THEN 'material_ordered'
        WHEN 'installation_done' THEN 'installation_completed'
        WHEN 'wiring_done' THEN 'wiring_completed'
        WHEN 'project_completed' THEN 'project_finalized'
        ELSE NULL
      END AS event_key,
      CASE new_value->>'status'
        WHEN 'loan_process' THEN 'Loan Submitted'
        WHEN 'loan_done' THEN 'Loan Approved'
        WHEN 'material_ordered' THEN 'Material Ordered'
        WHEN 'installation_done' THEN 'Installation Completed'
        WHEN 'wiring_done' THEN 'Wiring Completed'
        WHEN 'project_completed' THEN 'Finalized'
        ELSE NULL
      END AS label,
      al.created_at AS happened_at,
      al.user_id AS staff_user_id,
      CASE new_value->>'status'
        WHEN 'loan_process' THEN 60
        WHEN 'loan_done' THEN 70
        WHEN 'material_ordered' THEN 80
        WHEN 'installation_done' THEN 90
        WHEN 'wiring_done' THEN 100
        WHEN 'project_completed' THEN 110
        ELSE NULL
      END AS sort_order,
      CASE new_value->>'status'
        WHEN 'loan_process' THEN 'Loan file moved into processing'
        WHEN 'loan_done' THEN 'Loan approval recorded'
        WHEN 'material_ordered' THEN 'Material ordering confirmed'
        WHEN 'installation_done' THEN 'Installation marked complete'
        WHEN 'wiring_done' THEN 'Wiring marked complete'
        WHEN 'project_completed' THEN 'Project marked finalized'
        ELSE NULL
      END AS details
    FROM public.audit_logs al
    WHERE al.entity_type = 'project'
      AND al.entity_id = p.id::text
      AND al.action = 'project_status_update'
      AND (al.new_value->>'status') IN ('loan_process', 'loan_done', 'material_ordered', 'installation_done', 'wiring_done', 'project_completed')
  ),
  all_events AS (
    SELECT * FROM lead_created
    UNION ALL
    SELECT * FROM first_follow_up
    UNION ALL
    SELECT * FROM first_site_visit
    UNION ALL
    SELECT * FROM documents_collected
    UNION ALL
    SELECT * FROM quotation_generated
    UNION ALL
    SELECT * FROM status_events WHERE event_key IS NOT NULL
  )
  SELECT
    e.event_key,
    e.label,
    e.happened_at,
    e.staff_user_id,
    sr.full_name AS staff_name,
    sr.role AS staff_role,
    e.details,
    e.sort_order
  FROM all_events e
  LEFT JOIN staff_roles sr ON sr.user_id = e.staff_user_id
  WHERE e.happened_at IS NOT NULL
  ORDER BY e.sort_order, e.happened_at;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_project_timeline(uuid) TO authenticated;