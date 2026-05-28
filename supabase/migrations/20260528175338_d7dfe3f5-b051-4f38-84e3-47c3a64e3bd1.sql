
-- Update the sync function: late after 10:05, OT after 8h (480 min)
CREATE OR REPLACE FUNCTION public.sync_attendance_from_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d date := (NEW.captured_at AT TIME ZONE 'Asia/Kolkata')::date;
  att_id uuid;
  c_in timestamptz;
  c_out timestamptz;
  worked int;
  new_status public.attendance_status;
  late_cutoff time := '10:05';
  standard_minutes int := 480; -- 8 hours
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
         overtime_minutes = GREATEST(worked - standard_minutes, 0),
         status = new_status,
         updated_at = now()
   WHERE id = att_id;

  RETURN NEW;
END $function$;

-- Backfill existing attendance rows with the new late + OT rule
UPDATE public.attendance a
   SET overtime_minutes = GREATEST(COALESCE(a.worked_minutes,0) - 480, 0),
       status = CASE
         WHEN a.check_in_at IS NULL THEN 'absent'::attendance_status
         WHEN COALESCE(a.worked_minutes,0) >= 360 THEN
           CASE WHEN (a.check_in_at AT TIME ZONE 'Asia/Kolkata')::time > '10:05'::time
                THEN 'late'::attendance_status ELSE 'present'::attendance_status END
         WHEN COALESCE(a.worked_minutes,0) >= 1 THEN 'half_day'::attendance_status
         ELSE CASE WHEN (a.check_in_at AT TIME ZONE 'Asia/Kolkata')::time > '10:05'::time
                THEN 'late'::attendance_status ELSE 'present'::attendance_status END
       END,
       updated_at = now();
