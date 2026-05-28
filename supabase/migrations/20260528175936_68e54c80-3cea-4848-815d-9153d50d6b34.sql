
-- Today's KM for a given user (last reading - first reading for that local date)
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

-- Daily KM rows for a month
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

-- Monthly summary
CREATE OR REPLACE FUNCTION public.bike_km_summary(_user uuid, _year int, _month int)
RETURNS TABLE(total_km numeric, active_days bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user <> auth.uid() AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT COALESCE(SUM(km), 0)::numeric, COUNT(*)::bigint
  FROM public.bike_km_for_month(_user, _year, _month);
END $$;

GRANT EXECUTE ON FUNCTION public.bike_km_for_day(uuid, date)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.bike_km_for_month(uuid, int, int)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.bike_km_summary(uuid, int, int)    TO authenticated;
