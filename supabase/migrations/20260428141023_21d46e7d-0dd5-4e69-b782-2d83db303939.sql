CREATE OR REPLACE FUNCTION public.prevent_final_lead_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'final'::lead_status THEN
    RAISE EXCEPTION 'Finalized leads cannot be edited';
  END IF;

  IF TG_OP = 'DELETE' AND OLD.status = 'final'::lead_status THEN
    RAISE EXCEPTION 'Finalized leads cannot be deleted';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS prevent_final_lead_changes_trigger ON public.leads;
CREATE TRIGGER prevent_final_lead_changes_trigger
BEFORE UPDATE OR DELETE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.prevent_final_lead_changes();