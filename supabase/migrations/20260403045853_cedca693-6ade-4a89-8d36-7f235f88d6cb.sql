
-- Trigger: Notify staff when a lead is assigned to them
CREATE OR REPLACE FUNCTION public.notify_lead_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to_user_id IS NOT NULL AND (OLD.assigned_to_user_id IS NULL OR OLD.assigned_to_user_id != NEW.assigned_to_user_id) THEN
    INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
    VALUES (
      NEW.assigned_to_user_id,
      'New Lead Assigned',
      'Lead "' || NEW.customer_name || '" has been assigned to you.',
      'lead_assigned',
      'lead',
      NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_lead_assigned
AFTER UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.notify_lead_assigned();

-- Trigger: Notify project creator when project status changes
CREATE OR REPLACE FUNCTION public.notify_project_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
    VALUES (
      NEW.created_by_user_id,
      'Project Status Updated',
      'Project ' || NEW.project_code || ' status changed to ' || REPLACE(NEW.status::text, '_', ' ') || '.',
      'project_status',
      'project',
      NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_project_status
AFTER UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.notify_project_status_change();

-- Trigger: Notify document uploader when document is rejected
CREATE OR REPLACE FUNCTION public.notify_document_rejected()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_verified = false AND NEW.rejection_reason IS NOT NULL AND (OLD.rejection_reason IS DISTINCT FROM NEW.rejection_reason) THEN
    INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
    VALUES (
      NEW.uploaded_by_user_id,
      'Document Rejected',
      'Your ' || REPLACE(NEW.document_type::text, '_', ' ') || ' document was rejected: ' || NEW.rejection_reason,
      'document_rejected',
      'document',
      NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_document_rejected
AFTER UPDATE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.notify_document_rejected();

-- Trigger: Notify welder/electrician when assigned to a project
CREATE OR REPLACE FUNCTION public.notify_worker_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_welder_id IS NOT NULL AND (OLD.assigned_welder_id IS NULL OR OLD.assigned_welder_id != NEW.assigned_welder_id) THEN
    INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
    VALUES (
      NEW.assigned_welder_id,
      'New Installation Assigned',
      'You have been assigned to project ' || NEW.project_code || ' for installation.',
      'worker_assigned',
      'project',
      NEW.id::text
    );
  END IF;
  IF NEW.assigned_electrician_id IS NOT NULL AND (OLD.assigned_electrician_id IS NULL OR OLD.assigned_electrician_id != NEW.assigned_electrician_id) THEN
    INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
    VALUES (
      NEW.assigned_electrician_id,
      'New Wiring Task Assigned',
      'You have been assigned to project ' || NEW.project_code || ' for wiring.',
      'worker_assigned',
      'project',
      NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_worker_assigned
AFTER UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.notify_worker_assigned();
