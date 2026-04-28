CREATE OR REPLACE FUNCTION public.generate_quotation_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'MS-QT-' || EXTRACT(YEAR FROM now())::TEXT || '-' ||
    LPAD((COALESCE(
      (SELECT COUNT(*)::INTEGER + 1 FROM public.quotations
       WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now())),
      1
    ))::TEXT, 4, '0')
$$;

UPDATE public.quotations
SET quotation_number = 'MS-' || quotation_number
WHERE quotation_number LIKE 'QT-%'
  AND quotation_number NOT LIKE 'MS-QT-%';