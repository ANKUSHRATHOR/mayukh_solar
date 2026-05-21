
-- Tasks
DO $$ BEGIN
  CREATE TYPE public.task_priority AS ENUM ('low','medium','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.task_status AS ENUM ('pending','in_progress','completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  priority public.task_priority NOT NULL DEFAULT 'medium',
  status public.task_status NOT NULL DEFAULT 'pending',
  due_date date,
  assigned_to_user_id uuid NOT NULL,
  assigned_by_user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  proof_image_path text,
  staff_notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/operator full tasks" ON public.tasks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'operator'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'operator'::app_role));

CREATE POLICY "Assignee view tasks" ON public.tasks
  FOR SELECT TO authenticated USING (assigned_to_user_id = auth.uid());

CREATE POLICY "Assignee update tasks" ON public.tasks
  FOR UPDATE TO authenticated
  USING (assigned_to_user_id = auth.uid())
  WITH CHECK (assigned_to_user_id = auth.uid());

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' OR NEW.assigned_to_user_id IS DISTINCT FROM OLD.assigned_to_user_id THEN
    INSERT INTO public.notifications(user_id,title,message,type,entity_type,entity_id)
    VALUES (NEW.assigned_to_user_id,'New Task Assigned',
      'New ' || NEW.priority::text || ' priority task: ' || NEW.title,
      'task_assigned','task',NEW.id::text);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notify_task_assigned
  AFTER INSERT OR UPDATE OF assigned_to_user_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned();

-- Auto-set completed_at via trigger when status flips
CREATE OR REPLACE FUNCTION public.task_status_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status='completed' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_task_status BEFORE UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.task_status_transition();

-- Password reset: store temp password (admin-only) + logs
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS temp_password_plain text,
  ADD COLUMN IF NOT EXISTS temp_password_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS temp_password_issued_by uuid;

CREATE TABLE IF NOT EXISTS public.password_reset_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL,
  reset_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.password_reset_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin view reset logs" ON public.password_reset_logs
  FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admin insert reset logs" ON public.password_reset_logs
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role));
