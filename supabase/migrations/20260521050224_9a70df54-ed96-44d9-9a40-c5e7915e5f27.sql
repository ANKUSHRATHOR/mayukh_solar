
DO $$ BEGIN
  CREATE TYPE public.punch_out_request_status AS ENUM ('pending','approved','rejected','consumed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.punch_out_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  reason text NOT NULL,
  status public.punch_out_request_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.punch_out_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sales manage own punch_out_requests" ON public.punch_out_requests
  FOR SELECT TO authenticated USING (staff_user_id = auth.uid());
CREATE POLICY "Sales insert own punch_out_requests" ON public.punch_out_requests
  FOR INSERT TO authenticated
  WITH CHECK (staff_user_id = auth.uid() AND has_role(auth.uid(),'sales_person'::app_role));
CREATE POLICY "Admin full punch_out_requests" ON public.punch_out_requests
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE OR REPLACE FUNCTION public.request_special_punch_out(_lat numeric, _lng numeric, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_id uuid; admin_user uuid; staff_name text;
BEGIN
  IF NOT has_role(auth.uid(),'sales_person'::app_role) THEN
    RAISE EXCEPTION 'Only sales persons can request';
  END IF;
  IF _lat IS NULL OR _lng IS NULL OR _reason IS NULL OR length(trim(_reason))=0 THEN
    RAISE EXCEPTION 'Location and reason are required';
  END IF;
  INSERT INTO public.punch_out_requests(staff_user_id,latitude,longitude,reason)
    VALUES (auth.uid(),_lat,_lng,_reason) RETURNING id INTO new_id;
  SELECT full_name INTO staff_name FROM public.staff WHERE user_id = auth.uid();
  FOR admin_user IN SELECT user_id FROM public.user_roles WHERE role='admin'::app_role LOOP
    INSERT INTO public.notifications(user_id,title,message,type,entity_type,entity_id)
    VALUES (admin_user,'Outside Punch-Out Request',
      COALESCE(staff_name,'Sales person') || ' requested outside punch-out: ' || _reason,
      'punch_out_request','punch_out_request',new_id::text);
  END LOOP;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.review_punch_out_request(_id uuid, _approve boolean, _notes text DEFAULT NULL)
RETURNS public.punch_out_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rec public.punch_out_requests;
BEGIN
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.punch_out_requests
    SET status = CASE WHEN _approve THEN 'approved'::punch_out_request_status ELSE 'rejected'::punch_out_request_status END,
        reviewed_by = auth.uid(), reviewed_at = now(), review_notes = _notes
    WHERE id = _id AND status = 'pending' RETURNING * INTO rec;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not pending or not found'; END IF;
  INSERT INTO public.notifications(user_id,title,message,type,entity_type,entity_id)
  VALUES (rec.staff_user_id,
    CASE WHEN _approve THEN 'Punch-Out Request Approved' ELSE 'Punch-Out Request Rejected' END,
    CASE WHEN _approve THEN 'You may now punch out from your current location.' ELSE COALESCE('Reason: '||_notes,'Your request was rejected.') END,
    'punch_out_review','punch_out_request',rec.id::text);
  RETURN rec;
END $$;

-- Update punch_attendance to honor approved request
CREATE OR REPLACE FUNCTION public.punch_attendance(
  _kind text, _lat numeric DEFAULT NULL, _lng numeric DEFAULT NULL,
  _accuracy numeric DEFAULT NULL, _image_path text DEFAULT NULL, _reading numeric DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
        -- Check for approved outside punch-out request (only allowed for check_out)
        IF _kind = 'check_out' THEN
          SELECT id INTO approved_req FROM public.punch_out_requests
           WHERE staff_user_id = auth.uid() AND status='approved'
             AND reviewed_at > now() - interval '2 hours'
           ORDER BY reviewed_at DESC LIMIT 1;
          IF approved_req IS NULL THEN RAISE EXCEPTION 'Outside allowed attendance area'; END IF;
          UPDATE public.punch_out_requests SET status='consumed' WHERE id = approved_req;
        ELSE
          RAISE EXCEPTION 'Outside allowed attendance area';
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
END $$;
