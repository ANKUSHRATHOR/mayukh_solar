-- Restore SELECT privileges on public.staff to authenticated and anon to resolve PostgREST 403 Forbidden errors
GRANT SELECT ON public.staff TO authenticated, anon;

-- Restore EXECUTE privilege on public.get_user_role to authenticated and anon
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated, anon;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
