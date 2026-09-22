-- HRMS teardown — removes every `hr_*` object and puts back what the HRMS
-- migrations changed underneath them.
--
-- Generated AND RUN on 2026-09-22, against project fjpjgsfcnicslwhrjqgl, when the
-- HRMS code was reverted out of the working tree. Kept as the record of what
-- was done; running it again is a no-op except for the function definitions. Nothing in the app references these objects any more, so this script
-- is safe to run once you have read it. It is NOT a migration: it lives at the
-- repo root deliberately so that no deploy applies it by accident.
--
-- Run it in the Supabase SQL editor for project fjpjgsfcnicslwhrjqgl, as a
-- whole, in one go. It is wrapped in a transaction: any failure rolls the lot
-- back and leaves the database exactly as it was.
--
-- READ THIS FIRST — three things this script cannot do for you:
--
--   1. REDEPLOY THE EDGE FUNCTIONS, and they will break the moment `is_hr` is
--      gone. The deployed copies of `create-staff`, `update-staff` and
--      `drive-storage` call `is_hr()`; the reverted source in this repo does
--      not. Deploy all three from this repo BEFORE or immediately after
--      running this, or creating a staff member will start failing with a
--      500. This is the one step that causes user-visible breakage if skipped.
--
--   2. REMOVE THE `hr_manager` VALUE FROM THE `app_role` ENUM. Postgres has no
--      DROP VALUE, and recreating the type means rewriting every column,
--      function signature and policy that mentions `app_role`. The value is
--      left in place, unused. Section 7 checks that nobody actually holds it,
--      which is what matters — the app's generated types no longer list the
--      role, so a live `hr_manager` row would leave that person unable to log
--      in properly.
--
--   3. REGENERATE `src/integrations/supabase/types.ts`. The `hr_*` entries
--      were stripped out of it by hand during the revert. Regenerate it after
--      running this so the file is honestly derived from the schema again.
--
-- The legacy attendance tables — `attendance`, `attendance_events`,
-- `attendance_geofences`, `punch_out_requests` — are NOT touched. They kept
-- their history all along, the restored attendance pages read them, and the
-- HRMS backfill only ever copied out of them.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Functions, including the `is_hr` helper.
--
-- Driven off the catalog rather than a hand-written list, so it removes what
-- the database actually has — including anything added after this was written
-- and any overload whose signature I would have had to guess.
-- ---------------------------------------------------------------------------
DO $teardown$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname LIKE 'hr\_%' OR p.proname = 'is_hr')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
  END LOOP;
END
$teardown$;

-- ---------------------------------------------------------------------------
-- 2. The reconciliation views (hr_recon_punches / hr_recon_days).
-- ---------------------------------------------------------------------------
DO $teardown$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v' AND c.relname LIKE 'hr\_%'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', r.relname);
  END LOOP;
END
$teardown$;

-- ---------------------------------------------------------------------------
-- 3. `staff` — back to the employee-master-free shape.
--
-- Before the columns, because two of them are typed on `hr_employment_type` /
-- `hr_employment_status` and two more are foreign keys into hr_ tables, so the
-- types and tables cannot go first.
--
-- This DROPS DATA: anything HR entered into the employee master (joining
-- dates, addresses, emergency contacts, bank and PAN details) goes with these
-- columns. If any of it was typed in for real, copy it out before running.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS hr_guard_staff_identity_trg ON public.staff;

ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_aadhaar_last4_chk,
  DROP CONSTRAINT IF EXISTS staff_exit_after_joining_chk;

ALTER TABLE public.staff
  DROP COLUMN IF EXISTS employee_code,
  DROP COLUMN IF EXISTS date_of_birth,
  DROP COLUMN IF EXISTS gender,
  DROP COLUMN IF EXISTS marital_status,
  DROP COLUMN IF EXISTS blood_group,
  DROP COLUMN IF EXISTS personal_email,
  DROP COLUMN IF EXISTS photo_ref,
  DROP COLUMN IF EXISTS joining_date,
  DROP COLUMN IF EXISTS confirmation_date,
  DROP COLUMN IF EXISTS probation_months,
  DROP COLUMN IF EXISTS notice_period_days,
  DROP COLUMN IF EXISTS exit_date,
  DROP COLUMN IF EXISTS exit_reason,
  DROP COLUMN IF EXISTS employment_type,
  DROP COLUMN IF EXISTS employment_status,
  DROP COLUMN IF EXISTS department_id,
  DROP COLUMN IF EXISTS designation_id,
  DROP COLUMN IF EXISTS reporting_manager_user_id,
  DROP COLUMN IF EXISTS address_line1,
  DROP COLUMN IF EXISTS address_line2,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS district,
  DROP COLUMN IF EXISTS state,
  DROP COLUMN IF EXISTS pincode,
  DROP COLUMN IF EXISTS permanent_address,
  DROP COLUMN IF EXISTS emergency_contact_name,
  DROP COLUMN IF EXISTS emergency_contact_relation,
  DROP COLUMN IF EXISTS emergency_contact_mobile,
  DROP COLUMN IF EXISTS pan_number,
  DROP COLUMN IF EXISTS aadhaar_last4,
  DROP COLUMN IF EXISTS bank_name,
  DROP COLUMN IF EXISTS bank_account_name,
  DROP COLUMN IF EXISTS bank_account_number,
  DROP COLUMN IF EXISTS bank_ifsc;

-- The HRMS migration revoked table-wide SELECT and granted it column by
-- column, so that the sensitive columns above were unreadable. Those columns
-- are gone, and `src/lib/staff.ts` is back to `select('*')` — which fails
-- outright against column grants. So: table-wide SELECT again, as in
-- 20260703184500_restore_grants.sql.
REVOKE SELECT ON public.staff FROM authenticated, anon;
GRANT SELECT ON public.staff TO authenticated, anon;

-- The HR policies, and the two pre-HRMS ones it replaced.
DROP POLICY IF EXISTS "HR read all staff" ON public.staff;
DROP POLICY IF EXISTS "HR update staff" ON public.staff;
DROP POLICY IF EXISTS "Managers read their reports" ON public.staff;

DROP POLICY IF EXISTS "Staff can update own profile" ON public.staff;
CREATE POLICY "Staff can update own profile"
  ON public.staff FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND email IS NOT DISTINCT FROM (SELECT s.email FROM public.staff s WHERE s.user_id = (SELECT auth.uid()))
    AND mobile IS NOT DISTINCT FROM (SELECT s.mobile FROM public.staff s WHERE s.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Allow staff to manage their own record" ON public.staff;
CREATE POLICY "Allow staff to manage their own record"
ON public.staff
FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL AND auth.uid() = user_id
)
WITH CHECK (
  auth.uid() IS NOT NULL AND auth.uid() = user_id
);

-- ---------------------------------------------------------------------------
-- 3b. `salary_runs` — the nine columns the reporting rewire added.
--
-- The restored pre-HRMS `compute_salary` neither writes nor reads them, so
-- they would sit on the table as dead weight. Every one of them is HRMS-era:
-- no pre-HRMS run ever had a value in them beyond the DEFAULT 0.
-- ---------------------------------------------------------------------------
ALTER TABLE public.salary_runs
  DROP COLUMN IF EXISTS paid_leave_days,
  DROP COLUMN IF EXISTS unpaid_leave_days,
  DROP COLUMN IF EXISTS week_off_days,
  DROP COLUMN IF EXISTS holiday_days,
  DROP COLUMN IF EXISTS working_days,
  DROP COLUMN IF EXISTS present_days_exact,
  DROP COLUMN IF EXISTS absent_days_exact,
  DROP COLUMN IF EXISTS finalized_at,
  DROP COLUMN IF EXISTS finalized_by;

-- ---------------------------------------------------------------------------
-- 4. The tables, then the enum types they were built on.
-- ---------------------------------------------------------------------------
DO $teardown$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'hr\_%'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.relname);
  END LOOP;

  FOR r IN
    SELECT t.typname
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'e' AND t.typname LIKE 'hr\_%'
  LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
  END LOOP;
END
$teardown$;

-- ---------------------------------------------------------------------------
-- 5. The scheduled jobs.
--
-- pg_cron is not installed on this project, so the HRMS migration's schedules
-- never took. Guarded rather than assumed, in case it has been installed since.
-- ---------------------------------------------------------------------------
DO $teardown$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR r IN EXECUTE $q$SELECT jobname FROM cron.job WHERE jobname LIKE 'hrms-%'$q$
    LOOP
      EXECUTE format('SELECT cron.unschedule(%L)', r.jobname);
    END LOOP;
  END IF;
END
$teardown$;

-- ---------------------------------------------------------------------------
-- 6. The five functions HRMS rewired to read `hr_*`.
--
-- These are NOT HRMS functions — they are payroll and reporting, and the app
-- calls them — so section 1's `hr_`-shaped sweep deliberately left them alone.
-- They are dropped and recreated rather than CREATE OR REPLACE'd: replacing a
-- function whose return type or argument list has changed is an error, and the
-- HRMS versions changed both. Restored verbatim from the migrations that last
-- defined them
-- before HRMS: `compute_salary` and `mark_salary_paid` from 20260518173037,
-- the bike-km pair from 20260528175936, `staff_performance` from
-- 20260918000300. They read the legacy `attendance` tables, which still hold
-- every row they ever did.
-- ---------------------------------------------------------------------------

-- Drop whatever signature is currently installed, then recreate.
DO $teardown$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('compute_salary','mark_salary_paid',
                        'bike_km_for_day','bike_km_for_month','staff_performance')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
  END LOOP;
END
$teardown$;

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

CREATE OR REPLACE FUNCTION public.bike_km_for_day(_user uuid, _date date)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_r numeric;
  last_r numeric;
BEGIN
  IF _user <> auth.uid() AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT MIN(bike_meter_reading), MAX(bike_meter_reading)
    INTO first_r, last_r
  FROM public.attendance_events
  WHERE staff_user_id = _user
    AND is_rejected = false
    AND bike_meter_reading IS NOT NULL
    AND (captured_at AT TIME ZONE 'Asia/Kolkata')::date = _date;

  IF first_r IS NULL OR last_r IS NULL THEN
    RETURN 0;
  END IF;

  RETURN GREATEST(last_r - first_r, 0);
END $$;

CREATE OR REPLACE FUNCTION public.bike_km_for_month(_user uuid, _year int, _month int)
RETURNS TABLE(day date, km numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user <> auth.uid() AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH rows AS (
    SELECT (captured_at AT TIME ZONE 'Asia/Kolkata')::date AS d,
           bike_meter_reading AS r
    FROM public.attendance_events
    WHERE staff_user_id = _user
      AND is_rejected = false
      AND bike_meter_reading IS NOT NULL
      AND EXTRACT(YEAR  FROM (captured_at AT TIME ZONE 'Asia/Kolkata')) = _year
      AND EXTRACT(MONTH FROM (captured_at AT TIME ZONE 'Asia/Kolkata')) = _month
  )
  SELECT d AS day, GREATEST(MAX(r) - MIN(r), 0) AS km
  FROM rows
  GROUP BY d
  ORDER BY d;
END $$;

CREATE OR REPLACE FUNCTION public.staff_performance(_from date, _to date)
RETURNS TABLE (user_id uuid, full_name text, role app_role,
  leads_created bigint, leads_assigned bigint,
  projects_completed bigint, present_days bigint, absent_days bigint, attendance_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.user_id, s.full_name,
         (SELECT role FROM public.user_roles WHERE user_id = s.user_id LIMIT 1),
         (SELECT COUNT(*) FROM public.leads l WHERE l.created_by_user_id = s.user_id AND l.created_at::date BETWEEN _from AND _to),
         (SELECT COUNT(*) FROM public.leads l WHERE (l.assigned_to_user_id = s.user_id OR l.assigned_telecaller_id = s.user_id) AND l.created_at::date BETWEEN _from AND _to),
         (SELECT COUNT(*) FROM public.projects p WHERE p.assigned_sales_person_id = s.user_id AND p.status = 'project_completed'::project_status AND p.updated_at::date BETWEEN _from AND _to),
         (SELECT COUNT(*) FROM public.attendance a WHERE a.staff_user_id = s.user_id AND a.status IN ('present','late') AND a.date BETWEEN _from AND _to),
         (SELECT COUNT(*) FROM public.attendance a WHERE a.staff_user_id = s.user_id AND a.status = 'absent' AND a.date BETWEEN _from AND _to),
         CASE WHEN (_to - _from + 1) > 0
              THEN ROUND(100.0 * (SELECT COUNT(*) FROM public.attendance a WHERE a.staff_user_id = s.user_id AND a.status IN ('present','late','half_day') AND a.date BETWEEN _from AND _to) / (_to - _from + 1), 1)
              ELSE 0 END
  FROM public.staff s
  WHERE s.is_active = true
    AND has_role(auth.uid(), 'admin'::app_role)
  ORDER BY s.full_name;
$$;

-- Grants, as the original migrations left them.
REVOKE EXECUTE ON FUNCTION public.staff_performance(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_performance(date, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_salary(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_salary_paid(uuid, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bike_km_for_day(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bike_km_for_month(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_salary(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_salary_paid(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bike_km_for_day(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bike_km_for_month(uuid, integer, integer) TO authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- 7. Verification. Run these AFTER the commit above; they change nothing.
-- ---------------------------------------------------------------------------

-- Expect zero rows: no hr_ tables, views, types or functions left.
SELECT 'relation' AS kind, c.relname AS name
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname LIKE 'hr\_%' AND c.relkind IN ('r','v','m')
UNION ALL
SELECT 'type', t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typtype = 'e' AND t.typname LIKE 'hr\_%'
UNION ALL
SELECT 'function', p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND (p.proname LIKE 'hr\_%' OR p.proname = 'is_hr');

-- Expect zero rows. Anyone still holding hr_manager cannot use the app now
-- that the role is gone from the generated types — give them a real role.
SELECT user_id, role FROM public.user_roles WHERE role::text = 'hr_manager';

-- Expect four functions, and no reference to any hr_ table in their bodies.
SELECT p.proname, (p.prosrc LIKE '%hr\_%') AS still_reads_hrms
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('compute_salary','mark_salary_paid','bike_km_for_day','bike_km_for_month','staff_performance');

-- Expect the legacy attendance history to be intact and untouched.
SELECT 'attendance' AS t, count(*) FROM public.attendance
UNION ALL SELECT 'attendance_events', count(*) FROM public.attendance_events
UNION ALL SELECT 'attendance_geofences', count(*) FROM public.attendance_geofences
UNION ALL SELECT 'punch_out_requests', count(*) FROM public.punch_out_requests;
