-- Remove operator SELECT access to vendor_profiles (contains bank fields).
-- Operators don't read vendor profiles client-side; the quotation edge function
-- uses the service role, so this does not break functionality.
DROP POLICY IF EXISTS "Operators can view vendor profiles" ON public.vendor_profiles;