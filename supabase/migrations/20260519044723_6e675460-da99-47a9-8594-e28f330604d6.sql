CREATE OR REPLACE FUNCTION public.punch_attendance(
  _kind text,
  _lat numeric DEFAULT NULL,
  _lng numeric DEFAULT NULL,
  _accuracy numeric DEFAULT NULL,
  _image_path text DEFAULT NULL,
  _reading numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inside boolean := false;
  any_fence boolean := false;
  new_id uuid;
  is_sales boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _kind NOT IN ('check_in','field_visit','check_out') THEN RAISE EXCEPTION 'Invalid punch kind'; END IF;

  is_sales := has_role(auth.uid(), 'sales_person'::app_role);

  IF is_sales THEN
    IF _lat IS NULL OR _lng IS NULL THEN
      RAISE EXCEPTION 'Live location is required for sales persons';
    END IF;
    IF _image_path IS NULL THEN
      RAISE EXCEPTION 'Bike meter photo is required for sales persons';
    END IF;

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
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.attendance_events
    WHERE staff_user_id = auth.uid()
      AND kind = _kind::attendance_event_kind
      AND is_rejected = false
      AND captured_at > now() - interval '5 minutes'
  ) THEN
    RAISE EXCEPTION 'Duplicate punch; please wait a few minutes';
  END IF;

  INSERT INTO public.attendance_events
    (staff_user_id, kind, captured_at, latitude, longitude, accuracy_m, bike_meter_image_path, bike_meter_reading)
  VALUES (auth.uid(), _kind::attendance_event_kind, now(), _lat, _lng, _accuracy, _image_path, _reading)
  RETURNING id INTO new_id;
  RETURN new_id;
END
$function$;

REVOKE ALL ON FUNCTION public.punch_attendance(text, numeric, numeric, numeric, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.punch_attendance(text, numeric, numeric, numeric, text, numeric) TO authenticated;