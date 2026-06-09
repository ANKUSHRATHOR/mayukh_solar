
-- 1) Lock down temp password columns on staff: only service_role retains direct SELECT.
REVOKE SELECT (temp_password_plain, temp_password_issued_at, temp_password_issued_by)
  ON public.staff FROM authenticated, anon;

-- Admin-only RPC to fetch temp passwords for the credentials view.
CREATE OR REPLACE FUNCTION public.admin_list_temp_passwords()
RETURNS TABLE(
  user_id uuid,
  temp_password_plain text,
  temp_password_issued_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN QUERY
  SELECT s.user_id, s.temp_password_plain, s.temp_password_issued_at
  FROM public.staff s
  WHERE s.temp_password_plain IS NOT NULL
    AND s.must_change_password = true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_temp_passwords() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_temp_passwords() TO authenticated;

-- 2) Restrict sales_person SELECT on site_visits to their assigned leads only.
DROP POLICY IF EXISTS "Sales persons can view lead site visits" ON public.site_visits;

CREATE POLICY "Sales persons can view assigned lead site visits"
ON public.site_visits
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'sales_person'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = site_visits.lead_id
      AND (l.assigned_to_user_id = auth.uid() OR l.created_by_user_id = auth.uid())
  )
);
