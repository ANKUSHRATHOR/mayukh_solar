-- Repairs visits booked before the visit lifecycle existed.
--
-- The old Book Visit flow wrote a plain `site_visits` row whose only marker was
-- a note reading "Site Visit Appointment booked for …". 20260721000000 had no
-- way to distinguish those from call logs, so it classified them as `note` —
-- which means a genuinely booked visit does not appear in the visits panel and
-- has no "Complete this visit" button.
--
-- This promotes them to real scheduled visits, taking the appointment time from
-- the lead's follow_up_date (what the old flow actually stored it in).

UPDATE public.site_visits v
   SET visit_status        = 'scheduled',
       scheduled_for       = COALESCE(l.follow_up_date, v.visit_date),
       assigned_to_user_id = COALESCE(v.assigned_to_user_id, l.assigned_to_user_id)
  FROM public.leads l
 WHERE l.id = v.lead_id
   AND v.visit_status = 'note'
   AND v.visit_notes LIKE 'Site Visit Appointment booked for%'
   -- Only for leads still sitting at the booked stage. A lead that has since
   -- moved on had its visit dealt with by other means; leaving those as notes
   -- avoids resurrecting a stale "complete this visit" prompt.
   AND l.status = 'visit_created'
   AND v.completed_at IS NULL;

-- Any lead marked visit_created but with no visit row at all is inconsistent —
-- the old flow could set the status and then fail on the insert. Report them so
-- an admin can rebook rather than silently fabricating a visit.
DO $$
DECLARE orphaned int;
BEGIN
  SELECT count(*) INTO orphaned
    FROM public.leads l
   WHERE l.status = 'visit_created'
     AND NOT EXISTS (
       SELECT 1 FROM public.site_visits v
        WHERE v.lead_id = l.id AND v.visit_status IN ('scheduled', 'completed')
     );

  IF orphaned > 0 THEN
    RAISE NOTICE '% lead(s) are marked visit_created but have no visit row. Rebook them from the lead page.', orphaned;
  END IF;
END $$;
