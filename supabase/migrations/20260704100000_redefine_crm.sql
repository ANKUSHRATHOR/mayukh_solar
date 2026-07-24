-- Redefine Solar CRM: Leads, Deals, Projects, and Documents Schema Updates

-- 1. Update document_type enum values to support Aadhaar, PAN, Property papers, Feasibility, panel serial numbers, structures, netmetering, subsidies, invoices, and generic custom files
ALTER TYPE public.document_type ADD VALUE IF NOT EXISTS 'pan_card';
ALTER TYPE public.document_type ADD VALUE IF NOT EXISTS 'property_papers';
ALTER TYPE public.document_type ADD VALUE IF NOT EXISTS 'feasibility';
ALTER TYPE public.document_type ADD VALUE IF NOT EXISTS 'panel_serial_numbers';
ALTER TYPE public.document_type ADD VALUE IF NOT EXISTS 'overall_structure';
ALTER TYPE public.document_type ADD VALUE IF NOT EXISTS 'wiring_connection';
ALTER TYPE public.document_type ADD VALUE IF NOT EXISTS 'netmetering';
ALTER TYPE public.document_type ADD VALUE IF NOT EXISTS 'subsidy';
ALTER TYPE public.document_type ADD VALUE IF NOT EXISTS 'invoice';
ALTER TYPE public.document_type ADD VALUE IF NOT EXISTS 'other';

-- 2. Update leads table
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS k_number text,
  ADD COLUMN IF NOT EXISTS kno_details jsonb,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;

-- 3. Update documents table
-- Make project_id nullable so documents can be uploaded at the Leads/Deals stage
ALTER TABLE public.documents ALTER COLUMN project_id DROP NOT NULL;

-- Add lead_id referencing leads
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE;

-- Add custom_name for "other" or custom-named files
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS custom_name text;

-- Add constraint to ensure either project_id or lead_id is set
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS document_owner_check;
ALTER TABLE public.documents ADD CONSTRAINT document_owner_check CHECK (project_id IS NOT NULL OR lead_id IS NOT NULL);

-- 4. Update projects table
ALTER TABLE public.projects 
  ADD COLUMN IF NOT EXISTS loan_disbursed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS loan_disbursed_at timestamp with time zone;
