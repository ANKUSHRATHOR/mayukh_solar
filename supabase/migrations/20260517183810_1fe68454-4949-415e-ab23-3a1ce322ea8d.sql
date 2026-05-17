
-- ============================================================
-- ENUM for attendance status
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.attendance_status AS ENUM ('present','absent','half_day','late');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.attendance_kind AS ENUM ('check_in','field_visit','check_out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- attendance (one row per staff per day)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL,
  date date NOT NULL,
  check_in_at timestamptz,
  check_out_at timestamptz,
  status public.attendance_status NOT NULL DEFAULT 'absent',
  worked_minutes integer NOT NULL DEFAULT 0,
  overtime_minutes integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_user_id, date)
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff view own attendance" ON public.attendance;
CREATE POLICY "Staff view own attendance" ON public.attendance
  FOR SELECT TO authenticated USING (staff_user_id = auth.uid());

DROP POLICY IF EXISTS "Admin full attendance" ON public.attendance;
CREATE POLICY "Admin full attendance" ON public.attendance
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_attendance_staff_date ON public.attendance(staff_user_id, date DESC);

DROP TRIGGER IF EXISTS set_updated_at_attendance ON public.attendance;
CREATE TRIGGER set_updated_at_attendance BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- attendance_events (every punch)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id uuid,
  staff_user_id uuid NOT NULL,
  kind public.attendance_kind NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  accuracy_m numeric,
  bike_meter_image_path text,
  bike_meter_reading numeric,
  is_rejected boolean NOT NULL DEFAULT false,
  rejection_reason text,
  rejected_by uuid,
  rejected_at timestamptz,
  replaced_by_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff view own events" ON public.attendance_events;
CREATE POLICY "Staff view own events" ON public.attendance_events
  FOR SELECT TO authenticated USING (staff_user_id = auth.uid());

DROP POLICY IF EXISTS "Staff insert own events" ON public.attendance_events;
CREATE POLICY "Staff insert own events" ON public.attendance_events
  FOR INSERT TO authenticated WITH CHECK (staff_user_id = auth.uid());

DROP POLICY IF EXISTS "Staff update own pending events same day" ON public.attendance_events;
CREATE POLICY "Staff update own pending events same day" ON public.attendance_events
  FOR UPDATE TO authenticated
  USING (
    staff_user_id = auth.uid()
    AND is_rejected = false
    AND captured_at::date = CURRENT_DATE
  );

DROP POLICY IF EXISTS "Admin full events" ON public.attendance_events;
CREATE POLICY "Admin full events" ON public.attendance_events
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_events_staff_date ON public.attendance_events(staff_user_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_attendance ON public.attendance_events(attendance_id);

-- ============================================================
-- Trigger: derive attendance row from events
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_attendance_from_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date := (NEW.captured_at AT TIME ZONE 'Asia/Kolkata')::date;
  att_id uuid;
  c_in timestamptz;
  c_out timestamptz;
  worked int;
  new_status public.attendance_status;
  late_cutoff time := '10:00';
BEGIN
  IF NEW.is_rejected THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.attendance (staff_user_id, date, status)
  VALUES (NEW.staff_user_id, d, 'absent')
  ON CONFLICT (staff_user_id, date) DO NOTHING;

  SELECT id INTO att_id FROM public.attendance
   WHERE staff_user_id = NEW.staff_user_id AND date = d;

  NEW.attendance_id := att_id;

  SELECT
    MIN(captured_at) FILTER (WHERE kind='check_in' AND is_rejected=false),
    MAX(captured_at) FILTER (WHERE kind='check_out' AND is_rejected=false)
  INTO c_in, c_out
  FROM public.attendance_events
  WHERE staff_user_id = NEW.staff_user_id
    AND (captured_at AT TIME ZONE 'Asia/Kolkata')::date = d;

  IF NEW.kind = 'check_in' AND (c_in IS NULL OR NEW.captured_at < c_in) THEN c_in := NEW.captured_at; END IF;
  IF NEW.kind = 'check_out' AND (c_out IS NULL OR NEW.captured_at > c_out) THEN c_out := NEW.captured_at; END IF;

  worked := COALESCE(EXTRACT(EPOCH FROM (c_out - c_in))/60, 0)::int;

  IF c_in IS NULL THEN
    new_status := 'absent';
  ELSIF worked >= 360 THEN
    new_status := CASE WHEN (c_in AT TIME ZONE 'Asia/Kolkata')::time > late_cutoff THEN 'late' ELSE 'present' END;
  ELSIF worked >= 1 THEN
    new_status := 'half_day';
  ELSE
    new_status := CASE WHEN (c_in AT TIME ZONE 'Asia/Kolkata')::time > late_cutoff THEN 'late' ELSE 'present' END;
  END IF;

  UPDATE public.attendance
     SET check_in_at = c_in,
         check_out_at = c_out,
         worked_minutes = worked,
         overtime_minutes = GREATEST(worked - 540, 0),
         status = new_status,
         updated_at = now()
   WHERE id = att_id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_attendance_from_event_trigger ON public.attendance_events;
CREATE TRIGGER sync_attendance_from_event_trigger
  BEFORE INSERT ON public.attendance_events
  FOR EACH ROW EXECUTE FUNCTION public.sync_attendance_from_event();

-- Trigger: notify staff on rejection
CREATE OR REPLACE FUNCTION public.notify_event_rejected()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_rejected = true AND (OLD.is_rejected IS DISTINCT FROM NEW.is_rejected) THEN
    INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
    VALUES (
      NEW.staff_user_id,
      'Attendance image rejected',
      COALESCE('Reason: ' || NEW.rejection_reason, 'Your bike meter image was rejected. Please reupload.'),
      'attendance_rejected', 'attendance_event', NEW.id::text
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notify_event_rejected_trigger ON public.attendance_events;
CREATE TRIGGER notify_event_rejected_trigger AFTER UPDATE ON public.attendance_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_event_rejected();

-- ============================================================
-- salary_profiles & salary_runs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.salary_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL UNIQUE,
  monthly_salary numeric(12,2) NOT NULL DEFAULT 0,
  overtime_hourly_rate numeric(10,2) NOT NULL DEFAULT 0,
  working_days_per_month integer NOT NULL DEFAULT 26,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.salary_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin salary profiles" ON public.salary_profiles;
CREATE POLICY "Admin salary profiles" ON public.salary_profiles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS set_updated_at_salary_profiles ON public.salary_profiles;
CREATE TRIGGER set_updated_at_salary_profiles BEFORE UPDATE ON public.salary_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.salary_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  present_days integer NOT NULL DEFAULT 0,
  half_days integer NOT NULL DEFAULT 0,
  late_days integer NOT NULL DEFAULT 0,
  absent_days integer NOT NULL DEFAULT 0,
  overtime_minutes integer NOT NULL DEFAULT 0,
  gross numeric(12,2) NOT NULL DEFAULT 0,
  deductions numeric(12,2) NOT NULL DEFAULT 0,
  net numeric(12,2) NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid,
  UNIQUE (staff_user_id, year, month)
);
ALTER TABLE public.salary_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin salary runs" ON public.salary_runs;
CREATE POLICY "Admin salary runs" ON public.salary_runs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RPC: compute_salary (admin only)
CREATE OR REPLACE FUNCTION public.compute_salary(_user uuid, _year int, _month int)
RETURNS public.salary_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prof public.salary_profiles%ROWTYPE;
  rec public.salary_runs;
  per_day numeric;
  present_n int := 0;
  half_n int := 0;
  late_n int := 0;
  absent_n int := 0;
  ot_min int := 0;
  total_days int;
  gross_pay numeric := 0;
  ded numeric := 0;
  ot_pay numeric := 0;
  net_pay numeric := 0;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO prof FROM public.salary_profiles WHERE staff_user_id = _user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No salary profile for user';
  END IF;

  total_days := EXTRACT(DAY FROM (date_trunc('month', make_date(_year,_month,1)) + interval '1 month - 1 day'))::int;
  per_day := prof.monthly_salary / NULLIF(prof.working_days_per_month, 0);

  SELECT
    COUNT(*) FILTER (WHERE status='present'),
    COUNT(*) FILTER (WHERE status='half_day'),
    COUNT(*) FILTER (WHERE status='late'),
    COALESCE(SUM(overtime_minutes),0)
  INTO present_n, half_n, late_n, ot_min
  FROM public.attendance
  WHERE staff_user_id = _user
    AND EXTRACT(YEAR FROM date) = _year
    AND EXTRACT(MONTH FROM date) = _month;

  absent_n := GREATEST(prof.working_days_per_month - (present_n + late_n + half_n), 0);

  gross_pay := prof.monthly_salary;
  ded := (absent_n * per_day) + (half_n * per_day * 0.5);
  ot_pay := (ot_min / 60.0) * prof.overtime_hourly_rate;
  net_pay := GREATEST(gross_pay - ded + ot_pay, 0);

  INSERT INTO public.salary_runs
    (staff_user_id, year, month, present_days, half_days, late_days, absent_days,
     overtime_minutes, gross, deductions, net, generated_by)
  VALUES
    (_user, _year, _month, present_n, half_n, late_n, absent_n,
     ot_min, gross_pay, ded, net_pay, auth.uid())
  ON CONFLICT (staff_user_id, year, month) DO UPDATE
    SET present_days = EXCLUDED.present_days,
        half_days = EXCLUDED.half_days,
        late_days = EXCLUDED.late_days,
        absent_days = EXCLUDED.absent_days,
        overtime_minutes = EXCLUDED.overtime_minutes,
        gross = EXCLUDED.gross,
        deductions = EXCLUDED.deductions,
        net = EXCLUDED.net,
        generated_at = now(),
        generated_by = auth.uid()
  RETURNING * INTO rec;

  RETURN rec;
END $$;
GRANT EXECUTE ON FUNCTION public.compute_salary(uuid,int,int) TO authenticated;

-- ============================================================
-- RPC: reupload_event_image (staff)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reupload_event_image(
  _event_id uuid, _new_path text, _new_lat numeric, _new_lng numeric, _accuracy numeric DEFAULT NULL, _reading numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev public.attendance_events%ROWTYPE;
  new_id uuid;
BEGIN
  SELECT * INTO ev FROM public.attendance_events WHERE id = _event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'event not found'; END IF;
  IF ev.staff_user_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.attendance_events
    (staff_user_id, kind, captured_at, latitude, longitude, accuracy_m,
     bike_meter_image_path, bike_meter_reading)
  VALUES
    (ev.staff_user_id, ev.kind, now(), _new_lat, _new_lng, _accuracy, _new_path, _reading)
  RETURNING id INTO new_id;

  UPDATE public.attendance_events
     SET replaced_by_event_id = new_id,
         is_rejected = true,
         rejection_reason = COALESCE(rejection_reason, 'Replaced by reupload')
   WHERE id = _event_id;

  RETURN new_id;
END $$;
GRANT EXECUTE ON FUNCTION public.reupload_event_image(uuid,text,numeric,numeric,numeric,numeric) TO authenticated;

-- ============================================================
-- RPC: get_lead_people
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_lead_people(_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ld public.leads%ROWTYPE;
  result jsonb;
BEGIN
  SELECT * INTO ld FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR ld.created_by_user_id = auth.uid()
    OR ld.assigned_to_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.lead_id = _lead_id AND (
        p.assigned_sales_person_id = auth.uid()
        OR p.assigned_welder_id = auth.uid()
        OR p.assigned_electrician_id = auth.uid()
        OR p.assigned_operator_id = auth.uid()
        OR p.assigned_telecaller_id = auth.uid()
    ))
    OR has_role(auth.uid(), 'telecaller'::app_role)
    OR has_role(auth.uid(), 'operator'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'creator', (SELECT to_jsonb(s) FROM (SELECT user_id, full_name, mobile, email FROM public.staff WHERE user_id = ld.created_by_user_id) s),
    'assignee', (SELECT to_jsonb(s) FROM (SELECT user_id, full_name, mobile, email FROM public.staff WHERE user_id = ld.assigned_to_user_id) s),
    'history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', la.id,
        'from', (SELECT full_name FROM public.staff WHERE user_id = la.from_user_id),
        'to',   (SELECT full_name FROM public.staff WHERE user_id = la.to_user_id),
        'by',   (SELECT full_name FROM public.staff WHERE user_id = la.changed_by),
        'at',   la.created_at
      ) ORDER BY la.created_at DESC)
      FROM (SELECT * FROM public.lead_assignments WHERE lead_id = _lead_id ORDER BY created_at DESC LIMIT 20) la
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION public.get_lead_people(uuid) TO authenticated;

-- ============================================================
-- Storage bucket + policies
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
  VALUES ('attendance-media', 'attendance-media', false)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Staff manage own attendance media" ON storage.objects;
CREATE POLICY "Staff manage own attendance media" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'attendance-media' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'attendance-media' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Admin read attendance media" ON storage.objects;
CREATE POLICY "Admin read attendance media" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'attendance-media' AND has_role(auth.uid(), 'admin'::app_role));
