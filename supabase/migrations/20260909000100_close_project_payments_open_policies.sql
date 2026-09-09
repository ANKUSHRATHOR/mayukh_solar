-- Close the wide-open policies on project_payments.
--
-- 20260705040000 created four policies named "Allow authenticated users to
-- read/insert/update/delete project payments", each USING (true). The lockdown
-- in 20260719000200 meant to replace them but dropped a different set of names
-- ("Authenticated can view payments", ...) that never existed, and
-- 20260908000000 repeated that same drop list. Permissive policies are OR'd, so
-- every restriction written since July has been inert: any authenticated user --
-- welder, electrician, telecaller -- could read, insert, update and DELETE every
-- payment row.
--
-- Dropping them leaves the intended model actually in force:
--   admin    -- everything;
--   operator -- read and insert, no edits or deletes;
--   sales    -- read and insert on their own projects only;
--   everyone else -- no rows.
--
-- Lesson for the next lockdown: drop by the names in pg_policies, not by the
-- names you expect to be there.

DROP POLICY IF EXISTS "Allow authenticated users to read project payments"   ON public.project_payments;
DROP POLICY IF EXISTS "Allow authenticated users to insert project payments" ON public.project_payments;
DROP POLICY IF EXISTS "Allow authenticated users to update project payments" ON public.project_payments;
DROP POLICY IF EXISTS "Allow authenticated users to delete project payments" ON public.project_payments;
