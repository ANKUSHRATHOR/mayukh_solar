
DO $$ BEGIN
  CREATE TYPE public.visit_outcome AS ENUM (
    'interested','unavailable','docs_pending','site_issue',
    'payment_discussion','bank_followup','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.field_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  accuracy_m numeric,
  bike_meter_image_path text,
  bike_meter_reading numeric,
  notes text,
  outcome public.visit_outcome NOT NULL DEFAULT 'other',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.field_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sales insert own field visits" ON public.field_visits
  FOR INSERT TO authenticated
  WITH CHECK (staff_user_id = auth.uid() AND has_role(auth.uid(),'sales_person'::app_role));

CREATE POLICY "Staff view own field visits" ON public.field_visits
  FOR SELECT TO authenticated USING (staff_user_id = auth.uid());

CREATE POLICY "Admin/operator full field visits" ON public.field_visits
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'operator'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'operator'::app_role));

-- Consumer home location on projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS home_latitude numeric,
  ADD COLUMN IF NOT EXISTS home_longitude numeric,
  ADD COLUMN IF NOT EXISTS home_location_saved_by uuid,
  ADD COLUMN IF NOT EXISTS home_location_saved_at timestamptz;
