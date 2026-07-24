-- Update the signup trigger to use a unique fallback for mobile to prevent staff_mobile_key constraint violations
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert into public.staff with a unique mobile fallback (using user UUID suffix)
  INSERT INTO public.staff (user_id, full_name, mobile, email, is_active, must_change_password)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'phone', new.phone, 'pending_' || new.id::text),
    new.email,
    false, -- inactive by default
    false
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;
