-- Site visit lifecycle.
--
-- `site_visits` was being used for two unrelated things: a genuine scheduled
-- site visit, and a free-text note or call log. There was no way to tell them
-- apart, no scheduled-vs-completed state, and no place to record where the
-- surveyor actually stood.
--
-- That last point matters: the coordinates on the lead come from the DISCOM
-- K-number lookup, which is the billing address and is frequently wrong for the
-- installation site. Capturing GPS at visit completion gives a location that
-- was actually observed.

-- ---------------------------------------------------------------------------
-- Lifecycle columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.site_visits
  ADD COLUMN IF NOT EXISTS visit_status      text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS scheduled_for     timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid,
  ADD COLUMN IF NOT EXISTS latitude          numeric,
  ADD COLUMN IF NOT EXISTS longitude         numeric,
  ADD COLUMN IF NOT EXISTS location_accuracy_m numeric,
  ADD COLUMN IF NOT EXISTS outcome           text,
  ADD COLUMN IF NOT EXISTS cancelled_reason  text;

-- Existing rows are historical notes, not scheduled visits. Defaulting the new
-- column to 'completed' above keeps them out of the "upcoming visits" list;
-- this marks them explicitly as notes so the UI can separate the two.
UPDATE public.site_visits
   SET visit_status = 'note'
 WHERE completed_at IS NULL
   AND scheduled_for IS NULL
   AND visit_status = 'completed';

UPDATE public.site_visits
   SET completed_at = COALESCE(completed_at, visit_date)
 WHERE visit_status = 'completed';

ALTER TABLE public.site_visits DROP CONSTRAINT IF EXISTS site_visits_status_check;
ALTER TABLE public.site_visits
  ADD CONSTRAINT site_visits_status_check
  CHECK (visit_status IN ('scheduled', 'completed', 'cancelled', 'note'));

-- A completed visit must say where it happened. Enforced in the database so a
-- direct API call cannot record a visit without the observed location.
ALTER TABLE public.site_visits DROP CONSTRAINT IF EXISTS site_visits_completed_needs_location;
ALTER TABLE public.site_visits
  ADD CONSTRAINT site_visits_completed_needs_location
  CHECK (
    visit_status <> 'completed'
    OR completed_at IS NULL          -- legacy rows predating this column
    OR (latitude IS NOT NULL AND longitude IS NOT NULL)
  ) NOT VALID;   -- NOT VALID so existing note/legacy rows are not rejected

CREATE INDEX IF NOT EXISTS idx_site_visits_lead_status
  ON public.site_visits(lead_id, visit_status, scheduled_for DESC);

COMMENT ON COLUMN public.site_visits.visit_status IS
  'scheduled = booked, not yet done. completed = surveyed, has GPS. cancelled = did not happen. note = call log or free text, not a real visit.';
COMMENT ON COLUMN public.site_visits.latitude IS
  'Observed at visit completion. Authoritative over leads.latitude, which comes from the DISCOM billing address.';

-- ---------------------------------------------------------------------------
-- Completing a visit
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so the location requirement and the lead-status update
-- happen together and cannot be skipped by writing the row directly.

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

  IF _latitude IS NULL OR _longitude IS NULL THEN
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
         latitude            = _latitude,
         longitude           = _longitude,
         location_accuracy_m = _accuracy_m,
         outcome             = _outcome,
         visit_notes         = COALESCE(_notes, visit_notes),
         status_updated_to   = _lead_status::public.lead_status
   WHERE id = _visit_id;

  -- The surveyed location supersedes whatever the DISCOM lookup provided.
  UPDATE public.leads
     SET latitude  = _latitude,
         longitude = _longitude,
         status    = _lead_status::public.lead_status
   WHERE id = v.lead_id;

  RETURN jsonb_build_object('ok', true, 'visit_id', _visit_id, 'lead_id', v.lead_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.complete_site_visit(uuid, numeric, numeric, numeric, text, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.complete_site_visit(uuid, numeric, numeric, numeric, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Documents captured during a visit
-- ---------------------------------------------------------------------------
-- Lead-stage documents already exist (20260704100000 added documents.lead_id),
-- but no policy let a sales person write one. Without this the upload step of
-- visit completion fails under RLS.

DROP POLICY IF EXISTS "Staff manage lead documents" ON public.documents;
CREATE POLICY "Staff manage lead documents"
  ON public.documents FOR ALL TO authenticated
  USING (
    lead_id IS NOT NULL
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'operator'::app_role)
      OR has_role(auth.uid(), 'telecaller'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.leads l
         WHERE l.id = documents.lead_id
           AND (l.created_by_user_id = auth.uid() OR l.assigned_to_user_id = auth.uid())
      )
    )
  )
  WITH CHECK (
    lead_id IS NOT NULL
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'operator'::app_role)
      OR has_role(auth.uid(), 'telecaller'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.leads l
         WHERE l.id = documents.lead_id
           AND (l.created_by_user_id = auth.uid() OR l.assigned_to_user_id = auth.uid())
      )
    )
  );

-- Storage: lead documents live under `leads/{lead_id}/...`.
DROP POLICY IF EXISTS "Staff manage lead document files" ON storage.objects;
CREATE POLICY "Staff manage lead document files"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] = 'leads'
    AND EXISTS (
      SELECT 1 FROM public.leads l
       WHERE l.id::text = (storage.foldername(name))[2]
         AND (
           has_role(auth.uid(), 'admin'::app_role)
           OR has_role(auth.uid(), 'operator'::app_role)
           OR l.created_by_user_id = auth.uid()
           OR l.assigned_to_user_id = auth.uid()
         )
    )
  )
  WITH CHECK (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] = 'leads'
    AND EXISTS (
      SELECT 1 FROM public.leads l
       WHERE l.id::text = (storage.foldername(name))[2]
         AND (
           has_role(auth.uid(), 'admin'::app_role)
           OR has_role(auth.uid(), 'operator'::app_role)
           OR l.created_by_user_id = auth.uid()
           OR l.assigned_to_user_id = auth.uid()
         )
    )
  );
