-- 1. Simplify field_visits insert policy (drop has_role; staff_user_id=auth.uid() is sufficient)
DROP POLICY IF EXISTS "Sales insert own field visits" ON public.field_visits;
CREATE POLICY "Staff insert own field visits"
  ON public.field_visits FOR INSERT
  TO authenticated
  WITH CHECK (staff_user_id = auth.uid());

-- 2. Relax geofence in punch_attendance: only enforce for check_out
CREATE OR REPLACE FUNCTION public.punch_attendance(
  _kind text, _lat numeric DEFAULT NULL, _lng numeric DEFAULT NULL,
  _accuracy numeric DEFAULT NULL, _image_path text DEFAULT NULL, _reading numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  inside boolean := false;
  any_fence boolean := false;
  new_id uuid;
  is_sales boolean := false;
  approved_req uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _kind NOT IN ('check_in','field_visit','check_out') THEN RAISE EXCEPTION 'Invalid punch kind'; END IF;

  is_sales := has_role(auth.uid(),'sales_person'::app_role);

  IF is_sales THEN
    IF _lat IS NULL OR _lng IS NULL THEN RAISE EXCEPTION 'Live location is required for sales persons'; END IF;
    IF _image_path IS NULL THEN RAISE EXCEPTION 'Bike meter photo is required for sales persons'; END IF;

    -- Geofence is ONLY enforced for check_out (sales can check-in / field-visit from anywhere)
    IF _kind = 'check_out' THEN
      SELECT EXISTS (SELECT 1 FROM public.attendance_geofences WHERE is_active) INTO any_fence;
      IF any_fence THEN
        SELECT EXISTS (
          SELECT 1 FROM public.attendance_geofences g WHERE g.is_active
            AND 6371000 * acos(LEAST(1.0, GREATEST(-1.0,
              cos(radians(g.latitude))*cos(radians(_lat))*cos(radians(_lng)-radians(g.longitude))
              + sin(radians(g.latitude))*sin(radians(_lat))
            ))) <= g.radius_m
        ) INTO inside;
        IF NOT inside THEN
          SELECT id INTO approved_req FROM public.punch_out_requests
           WHERE staff_user_id = auth.uid() AND status='approved'
             AND reviewed_at > now() - interval '2 hours'
           ORDER BY reviewed_at DESC LIMIT 1;
          IF approved_req IS NULL THEN RAISE EXCEPTION 'Outside allowed attendance area'; END IF;
          UPDATE public.punch_out_requests SET status='consumed' WHERE id = approved_req;
        END IF;
      END IF;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.attendance_events
    WHERE staff_user_id = auth.uid()
      AND kind = _kind::public.attendance_kind
      AND is_rejected = false
      AND captured_at > now() - interval '5 minutes'
  ) THEN
    RAISE EXCEPTION 'Duplicate punch; please wait a few minutes';
  END IF;

  INSERT INTO public.attendance_events
    (staff_user_id, kind, captured_at, latitude, longitude, accuracy_m, bike_meter_image_path, bike_meter_reading)
  VALUES (auth.uid(), _kind::public.attendance_kind, now(), _lat, _lng, _accuracy, _image_path, _reading)
  RETURNING id INTO new_id;
  RETURN new_id;
END $function$;