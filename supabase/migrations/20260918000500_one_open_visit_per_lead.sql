-- One open site visit per lead.
--
-- Nothing stopped a second visit being booked while one was still outstanding,
-- so a lead could carry two "pending" visits, each on a different surveyor's
-- list, both counted as work to do. A visit that is finished — completed,
-- cancelled or deleted — frees the lead for the next one.
--
-- Enforced twice on purpose: the unique index is the rule (two people booking at
-- once cannot both win), and the check inside book_site_visit is there to answer
-- with a sentence a surveyor can act on rather than a constraint violation.

-- `note` rows are legacy call logs, never visits; only 'scheduled' is blocking.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_site_visits_one_open_per_lead
  ON public.site_visits (lead_id)
  WHERE visit_status = 'scheduled';

CREATE OR REPLACE FUNCTION public.book_site_visit(
  _lead_id       uuid,
  _scheduled_for timestamptz,
  _assigned_to   uuid DEFAULT NULL,
  _notes         text DEFAULT NULL
)
RETURNS public.site_visits
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  l public.leads%ROWTYPE;
  v public.site_visits%ROWTYPE;
  assignee_role app_role;
  open_visit timestamptz;
BEGIN
  IF _scheduled_for IS NULL THEN
    RAISE EXCEPTION 'Pick the visit date and time.';
  END IF;

  IF NOT public.can_act_on_lead(_lead_id) THEN
    RAISE EXCEPTION 'You do not have access to this lead.';
  END IF;

  SELECT * INTO l FROM public.leads WHERE id = _lead_id;
  IF l.status IN ('final'::lead_status, 'cancelled'::lead_status) THEN
    RAISE EXCEPTION 'This lead is %; a visit cannot be booked.', l.status;
  END IF;

  SELECT COALESCE(scheduled_for, visit_date) INTO open_visit
    FROM public.site_visits
   WHERE lead_id = _lead_id
     AND visit_status = 'scheduled'
   ORDER BY COALESCE(scheduled_for, visit_date)
   LIMIT 1;

  IF open_visit IS NOT NULL THEN
    RAISE EXCEPTION 'This lead already has a visit booked for %. Complete or cancel it before booking another.',
      to_char(open_visit AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM');
  END IF;

  INSERT INTO public.site_visits (
    lead_id, staff_id, assigned_to_user_id, visit_status,
    scheduled_for, visit_date, visit_notes, status_updated_to
  ) VALUES (
    _lead_id, auth.uid(), _assigned_to, 'scheduled',
    _scheduled_for, _scheduled_for, NULLIF(btrim(_notes), ''), 'visit_created'::lead_status
  )
  RETURNING * INTO v;

  IF _assigned_to IS NOT NULL THEN
    SELECT role INTO assignee_role FROM public.user_roles WHERE user_id = _assigned_to LIMIT 1;
  END IF;

  UPDATE public.leads
     SET status = 'visit_created'::lead_status,
         assigned_to_user_id = CASE
           WHEN assigned_to_user_id IS NULL AND assignee_role = 'sales_person'::app_role
             THEN _assigned_to
           ELSE assigned_to_user_id
         END
   WHERE id = _lead_id;

  PERFORM public.sync_lead_visit_state(_lead_id);
  RETURN v;
END $$;
