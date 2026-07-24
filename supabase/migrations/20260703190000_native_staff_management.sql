-- 1. Update signup trigger to mark new users as inactive and skip default role assignment
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert into public.staff as inactive/pending approval
  INSERT INTO public.staff (user_id, full_name, mobile, email, is_active, must_change_password)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'phone', new.phone, '0000000000'),
    new.email,
    false, -- inactive by default
    false
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- DO NOT assign any role yet. The admin must assign a role to approve and activate the user.

  RETURN new;
END;
$$;

-- 2. Create Admin Update Staff RPC function
CREATE OR REPLACE FUNCTION public.admin_update_staff(
  _staff_id UUID,
  _full_name TEXT,
  _mobile TEXT,
  _role app_role
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
BEGIN
  -- Check if caller is admin
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can manage staff roles';
  END IF;

  -- Get user_id from staff
  SELECT user_id INTO _user_id FROM public.staff WHERE id = _staff_id;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Staff member not found';
  END IF;

  -- Update staff profile details and activate them since we are assigning a role
  UPDATE public.staff
  SET 
    full_name = _full_name,
    mobile = _mobile,
    is_active = true,
    updated_at = now()
  WHERE id = _staff_id;

  -- Update or insert role in public.user_roles
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _role);

  RETURN true;
END;
$$;

-- 3. Create Admin Delete Staff RPC function
CREATE OR REPLACE FUNCTION public.admin_delete_staff(
  _staff_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
BEGIN
  -- Check if caller is admin
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can delete staff';
  END IF;

  -- Get user_id
  SELECT user_id INTO _user_id FROM public.staff WHERE id = _staff_id;

  -- Delete staff record (cascades where configured, otherwise handled)
  DELETE FROM public.staff WHERE id = _staff_id;
  
  IF _user_id IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = _user_id;
  END IF;

  RETURN true;
END;
$$;

-- 4. Create Admin Reset Password RPC function
CREATE OR REPLACE FUNCTION public.admin_reset_staff_password(
  _staff_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
-- `extensions` is on the path because pgcrypto (crypt/gen_salt) is installed
-- there on current Supabase projects, not in `public`. Without it the password
-- reset below fails at runtime with "function gen_salt(unknown) does not exist".
SET search_path = public, extensions
AS $$
DECLARE
  _user_id UUID;
  _new_pin TEXT;
BEGIN
  -- Check if caller is admin
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can reset passwords';
  END IF;

  -- Get user_id
  SELECT user_id INTO _user_id FROM public.staff WHERE id = _staff_id;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Staff member not found';
  END IF;

  -- Generate a random 6-digit PIN
  _new_pin := lpad(floor(random() * 1000000)::text, 6, '0');

  -- Update staff record
  UPDATE public.staff
  SET
    temp_password_plain = _new_pin,
    temp_password_issued_at = now(),
    must_change_password = true,
    updated_at = now()
  WHERE id = _staff_id;

  -- Update auth.users password using crypt
  UPDATE auth.users
  SET encrypted_password = crypt(_new_pin, gen_salt('bf'))
  WHERE id = _user_id;

  RETURN _new_pin;
END;
$$;
