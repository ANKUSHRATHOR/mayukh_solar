
CREATE TABLE public.project_status_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  note text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.project_status_notes TO authenticated;
GRANT ALL ON public.project_status_notes TO service_role;

ALTER TABLE public.project_status_notes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_project_status_notes_project ON public.project_status_notes(project_id, created_at DESC);

CREATE POLICY "Admin/operator insert status notes"
  ON public.project_status_notes FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
  );

CREATE POLICY "Project participants view status notes"
  ON public.project_status_notes FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'operator'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_status_notes.project_id
        AND (
          p.assigned_sales_person_id = auth.uid()
          OR p.assigned_welder_id = auth.uid()
          OR p.assigned_electrician_id = auth.uid()
        )
    )
  );
