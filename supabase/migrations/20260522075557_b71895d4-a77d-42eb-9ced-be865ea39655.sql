
-- Allow sales persons to update leads they created (not just assigned)
CREATE POLICY "Sales persons can update created leads"
ON public.leads FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'sales_person'::app_role) AND created_by_user_id = auth.uid())
WITH CHECK (has_role(auth.uid(), 'sales_person'::app_role) AND created_by_user_id = auth.uid());

-- Allow sales persons to view leads they created
CREATE POLICY "Sales persons can view created leads"
ON public.leads FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'sales_person'::app_role) AND created_by_user_id = auth.uid());
