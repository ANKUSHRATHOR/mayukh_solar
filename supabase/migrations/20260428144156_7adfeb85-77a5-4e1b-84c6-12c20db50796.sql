CREATE OR REPLACE FUNCTION public.audit_lead_cancel_or_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, old_value, new_value)
    VALUES (
      'lead_deleted',
      'lead',
      OLD.id::text,
      auth.uid(),
      to_jsonb(OLD),
      jsonb_build_object(
        'deleted_at', now(),
        'reason', COALESCE(OLD.cancelled_reason_other, OLD.cancelled_reason::text, 'No reason saved')
      )
    );
    RETURN OLD;
  END IF;

  IF OLD.is_in_bin IS DISTINCT FROM NEW.is_in_bin
     OR OLD.status IS DISTINCT FROM NEW.status
     OR OLD.cancelled_reason IS DISTINCT FROM NEW.cancelled_reason
     OR OLD.cancelled_reason_other IS DISTINCT FROM NEW.cancelled_reason_other THEN
    IF NEW.is_in_bin = true OR NEW.status IN ('cancelled', 'not_interested') THEN
      INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, old_value, new_value)
      VALUES (
        'lead_cancelled',
        'lead',
        NEW.id::text,
        auth.uid(),
        jsonb_build_object(
          'status', OLD.status,
          'is_in_bin', OLD.is_in_bin,
          'cancelled_reason', OLD.cancelled_reason,
          'cancelled_reason_other', OLD.cancelled_reason_other
        ),
        jsonb_build_object(
          'status', NEW.status,
          'is_in_bin', NEW.is_in_bin,
          'cancelled_reason', NEW.cancelled_reason,
          'cancelled_reason_other', NEW.cancelled_reason_other,
          'cancelled_at', now()
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_lead_cancel_or_delete_trigger ON public.leads;
CREATE TRIGGER audit_lead_cancel_or_delete_trigger
AFTER UPDATE OR DELETE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.audit_lead_cancel_or_delete();

CREATE OR REPLACE FUNCTION public.audit_project_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, old_value, new_value)
  VALUES (
    'project_deleted',
    'project',
    OLD.id::text,
    auth.uid(),
    to_jsonb(OLD),
    jsonb_build_object(
      'deleted_at', now(),
      'linked_lead_id', OLD.lead_id
    )
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS audit_project_delete_trigger ON public.projects;
CREATE TRIGGER audit_project_delete_trigger
AFTER DELETE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.audit_project_delete();