-- Convert single-object quotation_details to a single-element array for backwards compatibility
UPDATE public.leads
SET quotation_details = jsonb_build_array(quotation_details)
WHERE quotation_details IS NOT NULL 
  AND jsonb_typeof(quotation_details) = 'object';
