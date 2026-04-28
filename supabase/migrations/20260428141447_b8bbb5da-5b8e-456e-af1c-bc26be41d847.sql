DROP TRIGGER IF EXISTS prevent_final_lead_changes_trigger ON public.leads;
DROP FUNCTION IF EXISTS public.prevent_final_lead_changes();