-- Drop and recreate the RLS policy to allow staff to manage their own record
DROP POLICY IF EXISTS "Allow staff to manage their own record" ON public.staff;

CREATE POLICY "Allow staff to manage their own record"
ON public.staff
FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL AND auth.uid() = user_id
)
WITH CHECK (
  auth.uid() IS NOT NULL AND auth.uid() = user_id
);
