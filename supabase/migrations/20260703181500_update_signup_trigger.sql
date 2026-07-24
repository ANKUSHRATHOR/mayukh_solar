-- Update auto new user signup handler function to extract phone from metadata
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
    COALESCE(new.raw_user_meta_data->>'phone', new.phone, '0000000000'),
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
