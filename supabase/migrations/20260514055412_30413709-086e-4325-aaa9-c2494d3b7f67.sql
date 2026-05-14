CREATE OR REPLACE FUNCTION public.generate_project_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  yr text := EXTRACT(YEAR FROM now())::TEXT;
  next_num integer;
  candidate text;
BEGIN
  LOOP
    SELECT COALESCE(MAX(NULLIF(regexp_replace(project_code, '^MS-' || yr || '-', ''), '')::integer), 0) + 1
      INTO next_num
      FROM public.projects
     WHERE project_code LIKE 'MS-' || yr || '-%';

    candidate := 'MS-' || yr || '-' || LPAD(next_num::text, 4, '0');

    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE project_code = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_quotation_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  yr text := EXTRACT(YEAR FROM now())::TEXT;
  next_num integer;
  candidate text;
BEGIN
  LOOP
    SELECT COALESCE(MAX(NULLIF(regexp_replace(quotation_number, '^MS-QT-' || yr || '-', ''), '')::integer), 0) + 1
      INTO next_num
      FROM public.quotations
     WHERE quotation_number LIKE 'MS-QT-' || yr || '-%';

    candidate := 'MS-QT-' || yr || '-' || LPAD(next_num::text, 4, '0');

    IF NOT EXISTS (SELECT 1 FROM public.quotations WHERE quotation_number = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
END;
$function$;