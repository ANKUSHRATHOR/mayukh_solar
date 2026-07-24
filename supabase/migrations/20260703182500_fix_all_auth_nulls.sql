-- Patch to convert all NULL text columns in auth.users to empty strings to prevent Go-True scan errors (excluding unique phone)
UPDATE auth.users
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  email_change = COALESCE(email_change, ''),
  aud = COALESCE(aud, 'authenticated'),
  role = COALESCE(role, 'authenticated');

-- Clean up temp table
DROP TABLE IF EXISTS public.temp_columns;
