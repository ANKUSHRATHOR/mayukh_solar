
-- Add assigned_welder_id and assigned_electrician_id to projects
ALTER TABLE public.projects 
  ADD COLUMN IF NOT EXISTS assigned_welder_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_electrician_id uuid;

-- Welders can view projects assigned to them
CREATE POLICY "Welders can view assigned projects"
ON public.projects FOR SELECT
USING (has_role(auth.uid(), 'welder') AND assigned_welder_id = auth.uid());

-- Welders can update assigned projects
CREATE POLICY "Welders can update assigned projects"
ON public.projects FOR UPDATE
USING (has_role(auth.uid(), 'welder') AND assigned_welder_id = auth.uid());

-- Electricians can view assigned projects
CREATE POLICY "Electricians can view assigned projects"
ON public.projects FOR SELECT
USING (has_role(auth.uid(), 'electrician') AND assigned_electrician_id = auth.uid());

-- Electricians can update assigned projects
CREATE POLICY "Electricians can update assigned projects"
ON public.projects FOR UPDATE
USING (has_role(auth.uid(), 'electrician') AND assigned_electrician_id = auth.uid());

-- Welders can view leads (for customer info)
CREATE POLICY "Welders can view leads"
ON public.leads FOR SELECT
USING (has_role(auth.uid(), 'welder') AND is_in_bin = false);

-- Electricians can view leads
CREATE POLICY "Electricians can view leads"
ON public.leads FOR SELECT
USING (has_role(auth.uid(), 'electrician') AND is_in_bin = false);

-- Serial numbers table for electrician
CREATE TABLE public.serial_numbers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  panel_serial text NOT NULL,
  inverter_serial text NOT NULL,
  entered_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.serial_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage serial numbers"
ON public.serial_numbers FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Electricians can insert serial numbers"
ON public.serial_numbers FOR INSERT
WITH CHECK (has_role(auth.uid(), 'electrician') AND entered_by_user_id = auth.uid());

CREATE POLICY "Electricians can view serial numbers"
ON public.serial_numbers FOR SELECT
USING (has_role(auth.uid(), 'electrician') AND entered_by_user_id = auth.uid());

CREATE POLICY "Operators can view serial numbers"
ON public.serial_numbers FOR SELECT
USING (has_role(auth.uid(), 'operator'));
