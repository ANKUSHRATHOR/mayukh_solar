-- Lets welders and electricians upload the plant photos that now gate
-- installation completion.
--
-- Neither role had ANY policy on the project-documents bucket or on the
-- `documents` table, so the photo requirement would have been unsatisfiable —
-- the upload would fail under RLS with no route around it.
--
-- Access is scoped to projects the worker is actually assigned to, and to the
-- two document types that constitute their proof of work.

-- ---------------------------------------------------------------------------
-- Storage: project-documents
-- ---------------------------------------------------------------------------
-- Paths are `{project_id}/{document_type}.{ext}`, so foldername[1] is the
-- project id — the same convention sales uploads rely on.

DROP POLICY IF EXISTS "Field workers upload proof photos" ON storage.objects;
CREATE POLICY "Field workers upload proof photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id::text = (storage.foldername(name))[1]
         AND (
           (p.assigned_welder_id = auth.uid() AND has_role(auth.uid(), 'welder'::app_role))
           OR (p.assigned_electrician_id = auth.uid() AND has_role(auth.uid(), 'electrician'::app_role))
         )
    )
  );

-- Re-uploading after a rejection must overwrite, so UPDATE is needed too.
DROP POLICY IF EXISTS "Field workers replace own proof photos" ON storage.objects;
CREATE POLICY "Field workers replace own proof photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id::text = (storage.foldername(name))[1]
         AND (
           (p.assigned_welder_id = auth.uid() AND has_role(auth.uid(), 'welder'::app_role))
           OR (p.assigned_electrician_id = auth.uid() AND has_role(auth.uid(), 'electrician'::app_role))
         )
    )
  );

DROP POLICY IF EXISTS "Field workers view own project documents" ON storage.objects;
CREATE POLICY "Field workers view own project documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id::text = (storage.foldername(name))[1]
         AND (p.assigned_welder_id = auth.uid() OR p.assigned_electrician_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- documents table
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Field workers record proof documents" ON public.documents;
CREATE POLICY "Field workers record proof documents"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (
    document_type IN ('overall_structure', 'wiring_connection', 'panel_serial_numbers')
    AND uploaded_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id = documents.project_id
         AND (
           (p.assigned_welder_id = auth.uid() AND has_role(auth.uid(), 'welder'::app_role))
           OR (p.assigned_electrician_id = auth.uid() AND has_role(auth.uid(), 'electrician'::app_role))
         )
    )
  );

DROP POLICY IF EXISTS "Field workers update own proof documents" ON public.documents;
CREATE POLICY "Field workers update own proof documents"
  ON public.documents FOR UPDATE TO authenticated
  USING (
    document_type IN ('overall_structure', 'wiring_connection', 'panel_serial_numbers')
    AND uploaded_by_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Field workers view own project documents" ON public.documents;
CREATE POLICY "Field workers view own project documents"
  ON public.documents FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id = documents.project_id
         AND (p.assigned_welder_id = auth.uid() OR p.assigned_electrician_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Marking work done
-- ---------------------------------------------------------------------------
-- A SECURITY DEFINER function rather than a direct UPDATE, so the photo
-- requirement cannot be bypassed by a hand-crafted PostgREST call. Workers get
-- no UPDATE grant on projects at all.

CREATE OR REPLACE FUNCTION public.mark_trade_work_done(
  _project_id uuid,
  _trade text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  p public.projects%ROWTYPE;
  required_doc text;
  has_photo boolean;
BEGIN
  SELECT * INTO p FROM public.projects WHERE id = _project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found.';
  END IF;

  IF _trade = 'welder' THEN
    IF NOT (p.assigned_welder_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)) THEN
      RAISE EXCEPTION 'You are not the welder assigned to this project.';
    END IF;
    required_doc := 'overall_structure';
  ELSIF _trade = 'electrician' THEN
    IF NOT (p.assigned_electrician_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)) THEN
      RAISE EXCEPTION 'You are not the electrician assigned to this project.';
    END IF;
    required_doc := 'wiring_connection';
  ELSE
    RAISE EXCEPTION 'Unknown trade: %', _trade;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.documents
     WHERE project_id = _project_id
       AND document_type = required_doc::public.document_type
       AND file_url IS NOT NULL
  ) INTO has_photo;

  IF NOT has_photo THEN
    RAISE EXCEPTION 'Upload a photo of the plant before marking this work done.';
  END IF;

  IF _trade = 'welder' THEN
    UPDATE public.projects SET welder_work_done_at = now() WHERE id = _project_id;
  ELSE
    UPDATE public.projects SET electrician_work_done_at = now() WHERE id = _project_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'trade', _trade);
END $$;

REVOKE EXECUTE ON FUNCTION public.mark_trade_work_done(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_trade_work_done(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Serial numbers: make repeat submissions idempotent
-- ---------------------------------------------------------------------------
-- The electrician flow wrote serials and the status in two separate calls, so a
-- failure on the second left the serials committed and a retry inserted a
-- duplicate row. One row per project makes the retry safe.

DELETE FROM public.serial_numbers a
 USING public.serial_numbers b
 WHERE a.project_id = b.project_id
   AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS serial_numbers_project_unique
  ON public.serial_numbers(project_id);
