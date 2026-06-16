
CREATE OR REPLACE FUNCTION public.get_staff_directory()
RETURNS TABLE(user_id uuid, full_name text, mobile text, role text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.user_id, s.full_name, s.mobile, ur.role::text
  FROM public.staff s
  JOIN public.user_roles ur ON ur.user_id = s.user_id
  WHERE s.is_active = true
  ORDER BY ur.role, s.full_name;
$$;

REVOKE EXECUTE ON FUNCTION public.get_staff_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_directory() TO authenticated;
