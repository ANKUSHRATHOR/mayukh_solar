
-- Create lead status enum
CREATE TYPE public.lead_status AS ENUM ('new', 'visited', 'follow_up', 'interested', 'not_interested', 'cancelled', 'final');

-- Create lead source enum
CREATE TYPE public.lead_source AS ENUM ('phone_call', 'walk_in', 'reference', 'camp', 'online');

-- Create cancellation reason enum
CREATE TYPE public.cancellation_reason AS ENUM ('price_too_high', 'already_installed', 'not_interested_now', 'renting_property', 'false_wrong_number', 'duplicate_lead', 'other');

-- Create leads table
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  assigned_to_user_id UUID REFERENCES auth.users(id),
  customer_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  alt_mobile TEXT,
  village_city TEXT NOT NULL,
  district TEXT NOT NULL,
  state TEXT NOT NULL,
  address TEXT NOT NULL,
  kw_interest DECIMAL,
  source lead_source NOT NULL,
  reference_name TEXT,
  notes TEXT,
  status lead_status NOT NULL DEFAULT 'new',
  cancelled_reason cancellation_reason,
  cancelled_reason_other TEXT,
  is_in_bin BOOLEAN NOT NULL DEFAULT false,
  follow_up_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create site_visits table
CREATE TABLE public.site_visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES auth.users(id),
  visit_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  visit_notes TEXT,
  status_updated_to lead_status,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

-- Leads RLS policies
-- Admins can do everything
CREATE POLICY "Admins can manage all leads"
  ON public.leads FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Telecallers can create leads
CREATE POLICY "Telecallers can create leads"
  ON public.leads FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'telecaller') AND created_by_user_id = auth.uid());

-- Telecallers can view their own leads
CREATE POLICY "Telecallers can view own leads"
  ON public.leads FOR SELECT
  USING (public.has_role(auth.uid(), 'telecaller') AND created_by_user_id = auth.uid());

-- Sales persons can view all non-bin leads (unassigned or assigned to them)
CREATE POLICY "Sales persons can view leads"
  ON public.leads FOR SELECT
  USING (
    public.has_role(auth.uid(), 'sales_person')
    AND is_in_bin = false
  );

-- Sales persons can update leads assigned to them or unassigned
CREATE POLICY "Sales persons can update leads"
  ON public.leads FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'sales_person')
    AND (assigned_to_user_id = auth.uid() OR assigned_to_user_id IS NULL)
    AND is_in_bin = false
  );

-- Operators can view non-bin leads
CREATE POLICY "Operators can view leads"
  ON public.leads FOR SELECT
  USING (public.has_role(auth.uid(), 'operator') AND is_in_bin = false);

-- Site visits RLS policies
CREATE POLICY "Admins can manage all site visits"
  ON public.site_visits FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can create own site visits"
  ON public.site_visits FOR INSERT
  WITH CHECK (staff_id = auth.uid());

CREATE POLICY "Staff can view own site visits"
  ON public.site_visits FOR SELECT
  USING (staff_id = auth.uid());

CREATE POLICY "Sales persons can view lead site visits"
  ON public.site_visits FOR SELECT
  USING (public.has_role(auth.uid(), 'sales_person'));

-- Triggers
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to check duplicate mobile in leads
CREATE OR REPLACE FUNCTION public.check_duplicate_lead(_mobile TEXT)
RETURNS TABLE(id UUID, customer_name TEXT, status lead_status, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, customer_name, status, created_at
  FROM public.leads
  WHERE mobile = _mobile
$$;
