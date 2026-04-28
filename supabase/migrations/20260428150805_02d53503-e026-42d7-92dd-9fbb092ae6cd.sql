CREATE OR REPLACE FUNCTION public.complete_staff_password_setup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.staff
  SET must_change_password = false,
      updated_at = now()
  WHERE user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_staff_password_setup() TO authenticated;