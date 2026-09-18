-- Follow-up tasks from the call log.
--
-- 20260722010000 added `create_lead_followup_task`, but it never reached this
-- database: logging a call with a follow-up date failed at the task step with
-- "Could not find the function". This applies it, with the assignee reworked for
-- the two assignment slots (20260918000300).
--
-- Who gets the task: whoever logged the call, when they are on the lead — they
-- set the date, so it is their follow-up. Otherwise the telecaller, then the
-- sales rep, and the caller last so the task always lands somewhere.

CREATE OR REPLACE FUNCTION public.create_lead_followup_task(
  _lead_id uuid,
  _due_date date,
  _notes text DEFAULT NULL,
  _priority public.task_priority DEFAULT 'medium'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _lead public.leads%ROWTYPE;
  _assignee uuid;
  _task_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  IF auth.uid() IN (_lead.assigned_telecaller_id, _lead.assigned_to_user_id, _lead.created_by_user_id) THEN
    _assignee := auth.uid();
  ELSE
    _assignee := COALESCE(_lead.assigned_telecaller_id, _lead.assigned_to_user_id, auth.uid());
  END IF;

  INSERT INTO public.tasks (
    title, description, priority, status, due_date,
    assigned_to_user_id, assigned_by_user_id, lead_id
  ) VALUES (
    'Follow-up: ' || COALESCE(NULLIF(btrim(_lead.customer_name), ''), 'Lead'),
    _notes,
    _priority,
    'pending',
    _due_date,
    _assignee,
    auth.uid(),
    _lead_id
  ) RETURNING id INTO _task_id;

  RETURN _task_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_lead_followup_task(uuid, date, text, public.task_priority) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_lead_followup_task(uuid, date, text, public.task_priority) TO authenticated;

-- The person who logged the call should be able to open the task they created,
-- even when they are neither the assignee nor an admin.
DO $$ BEGIN
  CREATE POLICY "Creator view tasks" ON public.tasks
    FOR SELECT TO authenticated USING (assigned_by_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
