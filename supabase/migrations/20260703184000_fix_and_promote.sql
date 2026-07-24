-- 1. Fix the trigger function to use the correct composite unique constraint
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

  -- Insert into public.user_roles (default to sales_person) using the correct composite constraint
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    new.id,
    'sales_person'
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN new;
END;
$$;

-- 2. Promote ankushrathor1996@gmail.com to Admin based on their actual uid
DO $$
DECLARE
  actual_uid UUID;
BEGIN
  -- Find the user ID by email
  SELECT id INTO actual_uid FROM auth.users WHERE email = 'ankushrathor1996@gmail.com';
  
  IF actual_uid IS NOT NULL THEN
    -- Ensure staff profile exists and is active
    INSERT INTO public.staff (user_id, full_name, mobile, email, is_active, must_change_password)
    VALUES (actual_uid, 'Ankush Rathor', '9999999999', 'ankushrathor1996@gmail.com', true, false)
    ON CONFLICT (user_id) 
    DO UPDATE SET is_active = true, full_name = 'Ankush Rathor', email = 'ankushrathor1996@gmail.com';
    
    -- Delete all previous roles for this user to make sure they have a clean admin slate
    DELETE FROM public.user_roles WHERE user_id = actual_uid;
    
    -- Insert the admin role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (actual_uid, 'admin');
  END IF;
END $$;
