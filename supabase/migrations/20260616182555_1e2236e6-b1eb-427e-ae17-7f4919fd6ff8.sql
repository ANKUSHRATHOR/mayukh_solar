
CREATE POLICY "Telecallers view own lead site visits"
  ON public.site_visits FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'telecaller'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = site_visits.lead_id
        AND l.created_by_user_id = auth.uid()
    )
  );
