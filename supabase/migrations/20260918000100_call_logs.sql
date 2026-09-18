-- Call logs.
--
-- Calls were written into `site_visits` as rows whose only marker was a
-- "[Call Log] " prefix on the notes. They set no visit_status, so they took the
-- column default — 'completed' — and a phone call appeared in the visits list
-- and on the lead as a completed site survey. There was also no outcome on
-- them, so "how many calls today, and how many connected" could not be asked.
--
-- Calls now have their own table. A row is one attempt on one lead:
--
--   dialed        — the call button was pressed; nothing recorded yet.
--   connected     — the customer answered.
--   not_connected — no answer, switched off, wrong number.
--
-- Pressing the call button writes the `dialed` row; logging the call afterwards
-- resolves that same row rather than adding a second one, so "dialled" counts
-- calls, not clicks-plus-logs.

CREATE TABLE IF NOT EXISTS public.call_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  staff_id          uuid NOT NULL DEFAULT auth.uid(),
  outcome           text NOT NULL DEFAULT 'dialed'
                      CHECK (outcome IN ('dialed', 'connected', 'not_connected')),
  notes             text,
  -- The lead status this call moved the lead to, if any. Kept on the call so the
  -- lead's history reads as a sequence of calls and their consequences.
  status_updated_to public.lead_status,
  follow_up_date    date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- When the outcome was recorded; NULL while the row is still just `dialed`.
  logged_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_call_logs_lead    ON public.call_logs (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_staff   ON public.call_logs (staff_id, created_at DESC);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

-- Own calls, plus every call on a lead the caller can work — a telecaller's
-- calls are visible to the admin and to whoever else holds that lead.
DROP POLICY IF EXISTS "Staff manage reachable call logs" ON public.call_logs;
CREATE POLICY "Staff manage reachable call logs"
  ON public.call_logs FOR ALL TO authenticated
  USING (staff_id = (SELECT auth.uid()) OR public.can_act_on_lead(lead_id))
  WITH CHECK (staff_id = (SELECT auth.uid()) AND public.can_act_on_lead(lead_id));

-- ---------------------------------------------------------------------------
-- Move the existing call logs across
-- ---------------------------------------------------------------------------
-- Every historical one was a conversation someone typed up, so they land as
-- `connected`. The site_visits rows stay, demoted to 'note' so they stop
-- counting as completed surveys; `visits.ts` already hides notes from the visit
-- list, and the lead timeline reads calls from this table now.

INSERT INTO public.call_logs (lead_id, staff_id, outcome, notes, status_updated_to, created_at, logged_at)
SELECT v.lead_id,
       v.staff_id,
       'connected',
       nullif(btrim(regexp_replace(v.visit_notes, '^\[Call Log\]\s*', '')), ''),
       v.status_updated_to,
       v.visit_date,
       v.visit_date
  FROM public.site_visits v
 WHERE v.visit_notes LIKE '[Call Log]%'
   AND NOT EXISTS (
     SELECT 1 FROM public.call_logs c
      WHERE c.lead_id = v.lead_id AND c.created_at = v.visit_date
   );

UPDATE public.site_visits
   SET visit_status = 'note'
 WHERE visit_notes LIKE '[Call Log]%'
   AND visit_status <> 'note';

-- ---------------------------------------------------------------------------
-- Recording a call
-- ---------------------------------------------------------------------------

-- Pressing the call button. Fire-and-forget: the dial must not wait on it, so
-- it takes no arguments beyond the lead and answers with the row id.
CREATE OR REPLACE FUNCTION public.record_dial_attempt(_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF NOT public.can_act_on_lead(_lead_id) THEN
    RAISE EXCEPTION 'You do not have access to this lead.';
  END IF;

  INSERT INTO public.call_logs (lead_id, staff_id, outcome)
  VALUES (_lead_id, auth.uid(), 'dialed')
  RETURNING id INTO new_id;

  RETURN new_id;
END $$;

-- Logging what happened. Resolves this caller's most recent unresolved attempt
-- on the lead instead of adding a row, so pressing call and then logging the
-- call is one dial. Two hours is long enough for a call the telecaller writes up
-- later, short enough that yesterday's unfinished attempt is left alone.
CREATE OR REPLACE FUNCTION public.log_call(
  _lead_id        uuid,
  _outcome        text,
  _notes          text DEFAULT NULL,
  _status         text DEFAULT NULL,
  _follow_up_date date DEFAULT NULL
)
RETURNS public.call_logs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c public.call_logs%ROWTYPE;
  open_attempt uuid;
BEGIN
  IF _outcome NOT IN ('connected', 'not_connected') THEN
    RAISE EXCEPTION 'A logged call is either connected or not_connected.';
  END IF;
  IF NOT public.can_act_on_lead(_lead_id) THEN
    RAISE EXCEPTION 'You do not have access to this lead.';
  END IF;

  SELECT id INTO open_attempt
    FROM public.call_logs
   WHERE lead_id = _lead_id
     AND staff_id = auth.uid()
     AND outcome = 'dialed'
     AND created_at > now() - interval '2 hours'
   ORDER BY created_at DESC
   LIMIT 1;

  IF open_attempt IS NOT NULL THEN
    UPDATE public.call_logs
       SET outcome           = _outcome,
           notes             = NULLIF(btrim(_notes), ''),
           status_updated_to = _status::public.lead_status,
           follow_up_date    = _follow_up_date,
           logged_at         = now()
     WHERE id = open_attempt
    RETURNING * INTO c;
  ELSE
    INSERT INTO public.call_logs (lead_id, staff_id, outcome, notes, status_updated_to, follow_up_date, logged_at)
    VALUES (_lead_id, auth.uid(), _outcome, NULLIF(btrim(_notes), ''),
            _status::public.lead_status, _follow_up_date, now())
    RETURNING * INTO c;
  END IF;

  IF _status IS NOT NULL THEN
    UPDATE public.leads
       SET status         = _status::public.lead_status,
           follow_up_date = COALESCE(_follow_up_date::timestamptz, follow_up_date)
     WHERE id = _lead_id;
  END IF;

  RETURN c;
END $$;

REVOKE EXECUTE ON FUNCTION public.record_dial_attempt(uuid)                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_call(uuid, text, text, text, date)     FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_dial_attempt(uuid)                  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.log_call(uuid, text, text, text, date)     TO authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard figures
-- ---------------------------------------------------------------------------
-- One round trip for the whole tile row, the same reason projects_kpis and
-- payments_kpis exist. "Today" is the working day in India, not UTC: at 2am IST
-- a UTC day boundary would show the previous day's calls.

CREATE OR REPLACE FUNCTION public.telecaller_day_stats(_staff uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  who        uuid := COALESCE(_staff, auth.uid());
  day_start  timestamptz;
  month_start timestamptz;
  today_ist  date;
  result     jsonb;
BEGIN
  -- Only an admin may read someone else's numbers.
  IF who <> auth.uid() AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'You can only see your own figures.';
  END IF;

  today_ist   := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  day_start   := today_ist::timestamp AT TIME ZONE 'Asia/Kolkata';
  month_start := date_trunc('month', today_ist::timestamp) AT TIME ZONE 'Asia/Kolkata';

  SELECT jsonb_build_object(
    -- Today's calls
    'dialed',          count(*) FILTER (WHERE c.created_at >= day_start),
    'connected',       count(*) FILTER (WHERE c.created_at >= day_start AND c.outcome = 'connected'),
    'not_connected',   count(*) FILTER (WHERE c.created_at >= day_start AND c.outcome = 'not_connected'),
    -- Dialled but never written up. Shown so the three above add up on screen.
    'unlogged',        count(*) FILTER (WHERE c.created_at >= day_start AND c.outcome = 'dialed'),
    -- What the connected calls produced
    'interested',      count(*) FILTER (WHERE c.created_at >= day_start AND c.status_updated_to = 'interested'::lead_status),
    'follow_up',       count(*) FILTER (WHERE c.created_at >= day_start AND c.status_updated_to = 'follow_up'::lead_status),
    'not_interested',  count(*) FILTER (WHERE c.created_at >= day_start AND c.status_updated_to = 'not_interested'::lead_status),
    'month_calls',     count(*) FILTER (WHERE c.created_at >= month_start)
  ) INTO result
  FROM public.call_logs c
  WHERE c.staff_id = who
    AND c.created_at >= month_start;

  RETURN result
    || (
      -- Visits this telecaller booked, from their own leads.
      SELECT jsonb_build_object(
        'visits_created',       count(*) FILTER (WHERE v.created_at >= day_start),
        'month_visits_created', count(*)
      )
        FROM public.site_visits v
       WHERE v.staff_id = who
         AND v.visit_status <> 'note'
         AND v.created_at >= month_start
    )
    || (
      SELECT jsonb_build_object(
        'leads_created',       count(*) FILTER (WHERE l.created_at >= day_start),
        'month_leads_created', count(*)
      )
        FROM public.leads l
       WHERE l.created_by_user_id = who
         AND l.is_in_bin = false
         AND l.created_at >= month_start
    )
    || (
      -- The worklist: follow-ups this caller owes. Not limited to the month, and
      -- counted on the lead rather than the call, so a follow-up set any way at
      -- all still shows up.
      SELECT jsonb_build_object(
        'follow_ups_due_today', count(*) FILTER (
          WHERE (l.follow_up_date AT TIME ZONE 'Asia/Kolkata')::date = today_ist),
        'follow_ups_overdue',   count(*) FILTER (
          WHERE (l.follow_up_date AT TIME ZONE 'Asia/Kolkata')::date < today_ist)
      )
        FROM public.leads l
       WHERE l.is_in_bin = false
         AND l.follow_up_date IS NOT NULL
         AND l.status NOT IN ('final'::lead_status, 'cancelled'::lead_status, 'not_interested'::lead_status)
         AND (l.assigned_to_user_id = who OR l.created_by_user_id = who)
    );
END $$;

REVOKE EXECUTE ON FUNCTION public.telecaller_day_stats(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.telecaller_day_stats(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Not Connected joins the stage tallies
-- ---------------------------------------------------------------------------
-- The leads list counts each stage through this function; without the new key
-- its subset would always read zero. Body otherwise as applied on 2026-09-14.

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
    'not_connected',  count(*) FILTER (WHERE l.status = 'not_connected'),
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
