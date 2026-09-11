-- A lead's documents must follow it into its project.
--
-- `documents` carries `lead_id` and `project_id` independently. Everything
-- collected before conversion -- the Aadhaar, PAN, electricity bill and bank
-- passbook a surveyor gathers on the site visit -- is written with `lead_id`
-- only, and nothing ever stamped `project_id` when the lead became a project.
--
-- The visible symptom is a project asking for paperwork the customer already
-- provided. The real damage is server-side: `project_stage_requirements`
-- counts `FROM documents WHERE project_id = _project_id`, so those documents
-- are invisible to the gate, `documents_uploaded` stays false, and
-- `can_advance_project` refuses `documents_approved` forever. The project
-- cannot leave `documents_pending` no matter what is uploaded to the lead.
--
-- Fixed by owning it in the database rather than at each call site, so it
-- holds however the row arrives: the finalization form, a site visit
-- completing after conversion, a bulk import, or a hand-written SQL fix.
--
-- The row keeps BOTH ids. It is one document with two owners -- which the
-- `document_owner_check` constraint already allows -- so the lead page keeps
-- showing it and the project sees it too, with no copying and no second row
-- to keep in step.

-- The project a lead became, if any. Newest wins: `projects.lead_id` has no
-- unique constraint, so a re-created project must not resurrect the old one.
CREATE OR REPLACE FUNCTION public.project_for_lead(_lead_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.projects
   WHERE lead_id = _lead_id
   ORDER BY created_at DESC
   LIMIT 1
$$;

/**
 * Stamps the owning project onto a lead document as it is written.
 *
 * Skips the stamp when the project already holds that document type: the
 * table has UNIQUE (project_id, document_type), and a lead-side duplicate
 * must not fail the write. The row simply stays lead-only, which is the
 * behaviour that existed before this trigger.
 */
CREATE OR REPLACE FUNCTION public.stamp_document_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _project uuid;
BEGIN
  IF NEW.lead_id IS NULL OR NEW.project_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  _project := public.project_for_lead(NEW.lead_id);
  IF _project IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.documents
     WHERE project_id = _project
       AND document_type = NEW.document_type
       AND id IS DISTINCT FROM NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  NEW.project_id := _project;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS documents_stamp_project ON public.documents;
CREATE TRIGGER documents_stamp_project
  BEFORE INSERT OR UPDATE OF lead_id, document_type ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.stamp_document_project();

/**
 * The other direction: documents collected before the project existed.
 *
 * The trigger above only sees rows as they are written, and the whole point
 * is that the paperwork is gathered first and converted second.
 */
CREATE OR REPLACE FUNCTION public.adopt_lead_documents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.documents d
     SET project_id = NEW.id
   WHERE d.lead_id = NEW.lead_id
     AND d.project_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.documents other
        WHERE other.project_id = NEW.id
          AND other.document_type = d.document_type
     );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS projects_adopt_lead_documents ON public.projects;
CREATE TRIGGER projects_adopt_lead_documents
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.adopt_lead_documents();

-- Backfill every lead document whose project already exists. DISTINCT ON
-- keeps one row per (project, type) so the unique constraint holds even if a
-- lead somehow accumulated duplicates of a type.
WITH adoptable AS (
  SELECT DISTINCT ON (p.id, d.document_type) d.id AS document_id, p.id AS project_id
    FROM public.documents d
    JOIN public.projects p ON p.lead_id = d.lead_id
   WHERE d.project_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.documents other
        WHERE other.project_id = p.id
          AND other.document_type = d.document_type
     )
   ORDER BY p.id, d.document_type, d.uploaded_at DESC
)
UPDATE public.documents d
   SET project_id = a.project_id
  FROM adoptable a
 WHERE d.id = a.document_id;
