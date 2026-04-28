REVOKE EXECUTE ON FUNCTION public.audit_lead_cancel_or_delete() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_lead_cancel_or_delete() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_lead_cancel_or_delete() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.audit_project_delete() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_project_delete() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_project_delete() FROM authenticated;