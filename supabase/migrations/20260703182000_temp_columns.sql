-- Temp table to inspect auth.users schema
DROP TABLE IF EXISTS public.temp_columns;
CREATE TABLE public.temp_columns AS
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'auth' AND table_name = 'users';
GRANT SELECT ON public.temp_columns TO anon, authenticated, service_role;
