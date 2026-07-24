-- Fix nullable boolean/smallint fields in auth.users that trigger Go-True scanner errors
UPDATE auth.users
SET 
  is_super_admin = COALESCE(is_super_admin, false),
  email_change_confirm_status = COALESCE(email_change_confirm_status, 0::smallint);
