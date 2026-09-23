-- Two new visit outcomes never put anyone on site: a call that didn't
-- connect, and a customer who declines over the phone. `complete_site_visit`
-- previously required a GPS fix for every outcome unconditionally; that's
-- still right for an actual site visit, but forcing a location fix (and the
-- browser permission prompt with it) to log a phone call makes no sense.
--
-- The outcome values themselves are never validated against a fixed list —
-- `site_visits.outcome` is plain text, kept in sync with `VISIT_OUTCOMES` in
-- src/lib/visits.ts — so only the location gate needs to change here.

CREATE OR REPLACE FUNCTION public.complete_site_visit(
  _visit_id    uuid,
  _latitude    numeric,
  _longitude   numeric,
  _accuracy_m  numeric,
  _outcome     text,
  _lead_status text,
  _notes       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v public.site_visits%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.site_visits WHERE id = _visit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit not found.';
  END IF;

  IF v.visit_status = 'completed' THEN
    RAISE EXCEPTION 'This visit is already marked complete.';
  END IF;

  IF (_latitude IS NULL OR _longitude IS NULL)
     AND _outcome NOT IN ('call_not_connected', 'not_interested') THEN
    RAISE EXCEPTION 'Capture the site location before completing the visit.';
  END IF;

  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR v.assigned_to_user_id = auth.uid()
    OR v.staff_id = auth.uid()
    OR has_role(auth.uid(), 'sales_person'::app_role)
  ) THEN
    RAISE EXCEPTION 'You are not assigned to this visit.';
  END IF;

  UPDATE public.site_visits
     SET visit_status        = 'completed',
         completed_at        = now(),
         -- COALESCE rather than a plain assignment: a NULL fix here (call
         -- outcomes) must not erase a location a previous attempt captured.
         latitude            = COALESCE(_latitude, latitude),
         longitude           = COALESCE(_longitude, longitude),
         location_accuracy_m = COALESCE(_accuracy_m, location_accuracy_m),
         outcome             = _outcome,
         visit_notes         = COALESCE(_notes, visit_notes),
         status_updated_to   = _lead_status::public.lead_status
   WHERE id = _visit_id;

  -- The surveyed location supersedes whatever the DISCOM lookup provided —
  -- but only when one was actually captured. A call outcome must not wipe
  -- out coordinates the lead already had.
  IF _latitude IS NOT NULL AND _longitude IS NOT NULL THEN
    UPDATE public.leads
       SET latitude  = _latitude,
           longitude = _longitude,
           status    = _lead_status::public.lead_status
     WHERE id = v.lead_id;
  ELSE
    UPDATE public.leads
       SET status = _lead_status::public.lead_status
     WHERE id = v.lead_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'visit_id', _visit_id, 'lead_id', v.lead_id);
END $$;
