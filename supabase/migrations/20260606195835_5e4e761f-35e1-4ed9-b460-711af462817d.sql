
-- Add temp password storage to staff (referenced by update-staff edge function but column missing)
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS temp_password_plain text,
  ADD COLUMN IF NOT EXISTS temp_password_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS temp_password_issued_by uuid;

-- Clear temp password automatically when staff completes password change
CREATE OR REPLACE FUNCTION public.clear_temp_password_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.must_change_password = true AND NEW.must_change_password = false THEN
    NEW.temp_password_plain := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_clear_temp_password ON public.staff;
CREATE TRIGGER trg_clear_temp_password
BEFORE UPDATE ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.clear_temp_password_on_complete();
