
-- Create quotations table
CREATE TABLE public.quotations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_number text NOT NULL UNIQUE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  project_code text NOT NULL,
  customer_name text NOT NULL,
  customer_mobile text,
  customer_address text,
  capacity_kw numeric NOT NULL,
  total_amount numeric NOT NULL,
  created_by_user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

-- Generate quotation number function
CREATE OR REPLACE FUNCTION public.generate_quotation_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'QT-' || EXTRACT(YEAR FROM now())::TEXT || '-' ||
    LPAD((COALESCE(
      (SELECT COUNT(*)::INTEGER + 1 FROM public.quotations
       WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now())),
      1
    ))::TEXT, 4, '0')
$$;

-- RLS Policies
CREATE POLICY "Admins can manage all quotations"
ON public.quotations FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Sales persons can view own project quotations"
ON public.quotations FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'sales_person'::app_role)
  AND created_by_user_id = auth.uid()
);

CREATE POLICY "Sales persons can create quotations"
ON public.quotations FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'sales_person'::app_role)
  AND created_by_user_id = auth.uid()
);

CREATE POLICY "Operators can view all quotations"
ON public.quotations FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'operator'::app_role));

-- Index for searching by quotation number
CREATE INDEX idx_quotations_number ON public.quotations (quotation_number);
CREATE INDEX idx_quotations_customer_name ON public.quotations USING gin (to_tsvector('english', customer_name));
