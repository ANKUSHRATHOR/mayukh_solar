-- Promote ankushrathor1996@gmail.com to active Admin
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
    
    -- Set role to 'admin'
    DELETE FROM public.user_roles WHERE user_id = actual_uid;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (actual_uid, 'admin');
  END IF;
END $$;
