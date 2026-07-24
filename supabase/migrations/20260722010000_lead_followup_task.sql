-- Connect the leads module to tasks.
--
-- When a follow-up is set while logging a call, a task is created for the user
-- the lead is assigned to (its "operator"), due on the follow-up date. Whoever
-- logs the call is usually a telecaller or sales person, and the tasks RLS only
-- lets admin/operator INSERT — so creation goes through this SECURITY DEFINER
-- RPC, which also picks the assignee and stamps the creator.

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

  -- The lead's assignee is its operator. If the lead is unassigned, fall back
  -- to the caller so the follow-up still lands in someone's task list.
  _assignee := COALESCE(_lead.assigned_to_user_id, auth.uid());

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

GRANT EXECUTE ON FUNCTION public.create_lead_followup_task(uuid, date, text, public.task_priority) TO authenticated;

-- The person who logged the call (task creator) should be able to open the task
-- they just created, even when they are not the assignee or an admin/operator.
DO $$ BEGIN
  CREATE POLICY "Creator view tasks" ON public.tasks
    FOR SELECT TO authenticated USING (assigned_by_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
