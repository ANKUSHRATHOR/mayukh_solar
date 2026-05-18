
CREATE TABLE public.attendance_geofences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  radius_m integer NOT NULL DEFAULT 200,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.attendance_geofences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage geofences" ON public.attendance_geofences
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Staff read active geofences" ON public.attendance_geofences
  FOR SELECT TO authenticated USING (is_active = true);

CREATE UNIQUE INDEX IF NOT EXISTS ux_att_event_one_per_day
  ON public.attendance_events (staff_user_id, kind, ((captured_at AT TIME ZONE 'Asia/Kolkata')::date))
  WHERE is_rejected = false;

CREATE OR REPLACE FUNCTION public.punch_attendance(
  _kind text, _lat numeric, _lng numeric,
  _accuracy numeric DEFAULT NULL, _image_path text DEFAULT NULL, _reading numeric DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inside boolean := false; any_fence boolean := false; new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _kind NOT IN ('check_in','field_visit','check_out') THEN RAISE EXCEPTION 'Invalid punch kind'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.attendance_geofences WHERE is_active) INTO any_fence;
  IF any_fence THEN
    SELECT EXISTS (
      SELECT 1 FROM public.attendance_geofences g WHERE g.is_active
        AND 6371000 * acos(LEAST(1.0, GREATEST(-1.0,
          cos(radians(g.latitude))*cos(radians(_lat))*cos(radians(_lng)-radians(g.longitude))
          + sin(radians(g.latitude))*sin(radians(_lat))
        ))) <= g.radius_m
    ) INTO inside;
    IF NOT inside THEN RAISE EXCEPTION 'Outside allowed attendance area'; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.attendance_events
             WHERE staff_user_id = auth.uid() AND kind = _kind::attendance_event_kind
               AND is_rejected = false AND captured_at > now() - interval '5 minutes') THEN
    RAISE EXCEPTION 'Duplicate punch; wait a few minutes';
  END IF;

  INSERT INTO public.attendance_events
    (staff_user_id, kind, captured_at, latitude, longitude, accuracy_m, bike_meter_image_path, bike_meter_reading)
  VALUES (auth.uid(), _kind::attendance_event_kind, now(), _lat, _lng, _accuracy, _image_path, _reading)
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

ALTER TABLE public.salary_runs
  ADD COLUMN IF NOT EXISTS advance_deduction numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid;

CREATE TABLE public.salary_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL,
  amount numeric NOT NULL,
  given_on date NOT NULL DEFAULT CURRENT_DATE,
  note text, given_by uuid, deducted_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.salary_advances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin advances" ON public.salary_advances
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Staff view own advances" ON public.salary_advances
  FOR SELECT TO authenticated USING (staff_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.compute_salary(_user uuid, _year int, _month int)
RETURNS salary_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prof public.salary_profiles%ROWTYPE; rec public.salary_runs;
  per_day numeric;
  present_n int := 0; half_n int := 0; late_n int := 0; absent_n int := 0; ot_min int := 0;
  gross_pay numeric := 0; ded numeric := 0; ot_pay numeric := 0; adv_total numeric := 0; net_pay numeric := 0;
BEGIN
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO prof FROM public.salary_profiles WHERE staff_user_id = _user;
  IF NOT FOUND THEN RAISE EXCEPTION 'No salary profile for user'; END IF;
  per_day := prof.monthly_salary / NULLIF(prof.working_days_per_month,0);

  SELECT COUNT(*) FILTER (WHERE status='present'),
         COUNT(*) FILTER (WHERE status='half_day'),
         COUNT(*) FILTER (WHERE status='late'),
         COALESCE(SUM(overtime_minutes),0)
    INTO present_n, half_n, late_n, ot_min
    FROM public.attendance
   WHERE staff_user_id = _user
     AND EXTRACT(YEAR FROM date)=_year AND EXTRACT(MONTH FROM date)=_month;

  absent_n := GREATEST(prof.working_days_per_month - (present_n+late_n+half_n), 0);
  gross_pay := prof.monthly_salary;
  ded := (absent_n*per_day) + (half_n*per_day*0.5);
  ot_pay := (ot_min/60.0) * prof.overtime_hourly_rate;

  SELECT COALESCE(SUM(amount),0) INTO adv_total
    FROM public.salary_advances WHERE staff_user_id = _user AND deducted_run_id IS NULL;

  net_pay := GREATEST(gross_pay - ded + ot_pay - adv_total, 0);

  INSERT INTO public.salary_runs
    (staff_user_id, year, month, present_days, half_days, late_days, absent_days,
     overtime_minutes, gross, deductions, advance_deduction, net, generated_by, status)
  VALUES (_user, _year, _month, present_n, half_n, late_n, absent_n,
          ot_min, gross_pay, ded, adv_total, net_pay, auth.uid(), 'pending')
  ON CONFLICT (staff_user_id, year, month) DO UPDATE
    SET present_days=EXCLUDED.present_days, half_days=EXCLUDED.half_days,
        late_days=EXCLUDED.late_days, absent_days=EXCLUDED.absent_days,
        overtime_minutes=EXCLUDED.overtime_minutes, gross=EXCLUDED.gross,
        deductions=EXCLUDED.deductions, advance_deduction=EXCLUDED.advance_deduction,
        net=EXCLUDED.net, generated_at=now(), generated_by=auth.uid()
  RETURNING * INTO rec;

  UPDATE public.salary_advances SET deducted_run_id = rec.id
    WHERE staff_user_id = _user AND deducted_run_id IS NULL;

  RETURN rec;
END $$;

CREATE OR REPLACE FUNCTION public.mark_salary_paid(_run_id uuid, _amount numeric)
RETURNS salary_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rec public.salary_runs; new_status text;
BEGIN
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO rec FROM public.salary_runs WHERE id=_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  new_status := CASE WHEN (rec.paid_amount + _amount) >= rec.net THEN 'paid' ELSE 'partial' END;
  UPDATE public.salary_runs
     SET paid_amount = paid_amount + _amount, status = new_status,
         paid_at = now(), paid_by = auth.uid()
   WHERE id = _run_id RETURNING * INTO rec;
  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, new_value)
  VALUES ('salary_paid','salary_run', _run_id::text, auth.uid(),
          jsonb_build_object('amount',_amount,'status',new_status,'paid_total',rec.paid_amount));
  RETURN rec;
END $$;

CREATE OR REPLACE FUNCTION public.audit_lead_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, new_value)
    VALUES ('lead_created','lead', NEW.id::text, auth.uid(),
            jsonb_build_object('customer_name', NEW.customer_name, 'mobile', NEW.mobile, 'status', NEW.status));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.assigned_to_user_id IS DISTINCT FROM NEW.assigned_to_user_id THEN
      INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, old_value, new_value)
      VALUES ('lead_reassigned','lead', NEW.id::text, auth.uid(),
              jsonb_build_object('from', OLD.assigned_to_user_id),
              jsonb_build_object('to', NEW.assigned_to_user_id));
    ELSIF OLD.customer_name IS DISTINCT FROM NEW.customer_name
       OR OLD.mobile IS DISTINCT FROM NEW.mobile
       OR OLD.address IS DISTINCT FROM NEW.address
       OR OLD.notes IS DISTINCT FROM NEW.notes
       OR OLD.kw_interest IS DISTINCT FROM NEW.kw_interest THEN
      INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, new_value)
      VALUES ('lead_edited','lead', NEW.id::text, auth.uid(),
              jsonb_build_object('customer_name', NEW.customer_name, 'mobile', NEW.mobile));
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_audit_lead_changes ON public.leads;
CREATE TRIGGER trg_audit_lead_changes
AFTER INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.audit_lead_changes();

CREATE OR REPLACE FUNCTION public.audit_document_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (OLD.is_verified IS DISTINCT FROM NEW.is_verified) OR (OLD.rejection_reason IS DISTINCT FROM NEW.rejection_reason) THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, new_value)
    VALUES (CASE WHEN NEW.is_verified THEN 'document_approved' ELSE 'document_rejected' END,
            'document', NEW.id::text, auth.uid(),
            jsonb_build_object('document_type', NEW.document_type, 'rejection_reason', NEW.rejection_reason));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_audit_document_decision ON public.documents;
CREATE TRIGGER trg_audit_document_decision
AFTER UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.audit_document_decision();

CREATE OR REPLACE FUNCTION public.audit_attendance_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.is_rejected IS DISTINCT FROM NEW.is_rejected AND NEW.is_rejected THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, new_value)
    VALUES ('attendance_rejected','attendance_event', NEW.id::text, auth.uid(),
            jsonb_build_object('reason', NEW.rejection_reason, 'staff', NEW.staff_user_id));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_audit_attendance_event ON public.attendance_events;
CREATE TRIGGER trg_audit_attendance_event
AFTER UPDATE ON public.attendance_events
FOR EACH ROW EXECUTE FUNCTION public.audit_attendance_event();

CREATE OR REPLACE FUNCTION public.audit_salary_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, new_value)
  VALUES ('salary_profile_changed','salary_profile', NEW.staff_user_id::text, auth.uid(),
          jsonb_build_object('monthly_salary', NEW.monthly_salary, 'ot', NEW.overtime_hourly_rate));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_audit_salary_profile ON public.salary_profiles;
CREATE TRIGGER trg_audit_salary_profile
AFTER INSERT OR UPDATE ON public.salary_profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_salary_profile();

CREATE OR REPLACE FUNCTION public.log_user_event(_action text, _meta jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, new_value)
  VALUES (_action, 'auth', auth.uid()::text, auth.uid(), _meta);
END $$;

CREATE OR REPLACE FUNCTION public.staff_performance(_from date, _to date)
RETURNS TABLE (user_id uuid, full_name text, role app_role,
  leads_created bigint, leads_assigned bigint,
  projects_completed bigint, present_days bigint, absent_days bigint, attendance_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.user_id, s.full_name,
         (SELECT role FROM public.user_roles WHERE user_id = s.user_id LIMIT 1),
         (SELECT COUNT(*) FROM public.leads l WHERE l.created_by_user_id = s.user_id AND l.created_at::date BETWEEN _from AND _to),
         (SELECT COUNT(*) FROM public.leads l WHERE l.assigned_to_user_id = s.user_id AND l.created_at::date BETWEEN _from AND _to),
         (SELECT COUNT(*) FROM public.projects p WHERE p.assigned_sales_person_id = s.user_id AND p.status = 'project_completed'::project_status AND p.updated_at::date BETWEEN _from AND _to),
         (SELECT COUNT(*) FROM public.attendance a WHERE a.staff_user_id = s.user_id AND a.status IN ('present','late') AND a.date BETWEEN _from AND _to),
         (SELECT COUNT(*) FROM public.attendance a WHERE a.staff_user_id = s.user_id AND a.status = 'absent' AND a.date BETWEEN _from AND _to),
         CASE WHEN (_to - _from + 1) > 0
              THEN ROUND(100.0 * (SELECT COUNT(*) FROM public.attendance a WHERE a.staff_user_id = s.user_id AND a.status IN ('present','late','half_day') AND a.date BETWEEN _from AND _to) / (_to - _from + 1), 1)
              ELSE 0 END
  FROM public.staff s WHERE s.is_active = true ORDER BY s.full_name;
$$;

CREATE TABLE public.quotation_terms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, body text NOT NULL,
  section_order int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.quotation_terms_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage T&C" ON public.quotation_terms_templates
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Staff read active T&C" ON public.quotation_terms_templates
  FOR SELECT TO authenticated USING (is_active = true);

INSERT INTO public.quotation_terms_templates (title, body, section_order) VALUES
('Site Visit & Costing','Final cost confirmed only after site visit. Any duties or charges beyond those specified are extra.', 10),
('Delivery Timeline','Delivery within 5-6 weeks from receipt of firm order and advance payment.', 20),
('Warranty','Solar panels: 10-year manufacturing warranty. Modules: 30 years at 90% output. Inverter: 10-year warranty. Excludes breakage, natural calamities, unauthorized modifications.', 30),
('Non-Warranty Items','Meter (burnt cases), wires, MCBs, fuses and SPDs are not covered under warranty.', 40),
('AMC','Damages due to natural calamities are not covered under AMC.', 50),
('Payment Terms','Quotation valid 30 days. 30% advance, 60% after structure, 10% on commissioning. Interest 18% p.a. on payments delayed beyond 7 days.', 60),
('Legal Jurisdiction','Goods once sold will not be returned. All legal matters subject to Kota jurisdiction only. E&OE.', 70);

CREATE TABLE public.vendor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_name text NOT NULL, gstin text, address text, mobile text, email text,
  bank_name text, account_no text, account_type text, ifsc text, license_no text,
  is_default boolean NOT NULL DEFAULT false,
  raw_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vendor_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage vendor" ON public.vendor_profiles
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Staff read default vendor" ON public.vendor_profiles
  FOR SELECT TO authenticated USING (is_default = true);

INSERT INTO public.vendor_profiles (firm_name, gstin, address, mobile, bank_name, account_no, account_type, ifsc, license_no, is_default) VALUES
('V R ENTERPRISES','08BUMPR6551G2Z3','20, Sector-7 Keshavpura, Kota, Rajasthan','+91-9782767546','IDFC FIRST','79950673116','CURRENT ACCOUNT','IDFB0042542','CBLF240508063117807', true);
