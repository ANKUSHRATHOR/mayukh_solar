-- Create function to handle auto creation of staff and user roles on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert into public.staff
  INSERT INTO public.staff (user_id, full_name, mobile, email, must_change_password)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.phone, '0000000000'),
    new.email,
    false
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Insert into public.user_roles (default to sales_person)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    new.id,
    'sales_person'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;

-- Create trigger on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_signup();
