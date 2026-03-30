
-- Create structure type enum
CREATE TYPE public.structure_type AS ENUM ('rcc_roof', 'tin_shed_roof', 'ground_mount');

-- Create payment type enum
CREATE TYPE public.payment_type AS ENUM ('cash', 'loan');

-- Create project status enum
CREATE TYPE public.project_status AS ENUM (
  'pending_documents',
  'pending_operator_review',
  'registration_pending',
  'registration_done',
  'loan_process',
  'loan_done',
  'cash_file',
  'material_ordered',
  'material_dispatched',
  'material_delivered',
  'installation_pending',
  'installation_done',
  'wiring_pending',
  'wiring_done',
  'net_metering_submitted',
  'inspection_scheduled',
  'inspection_completed',
  'inspection_failed',
  'net_meter_installed',
  'project_completed'
);

-- Create document type enum
CREATE TYPE public.document_type AS ENUM (
  'electricity_bill',
  'aadhaar_front',
  'aadhaar_back',
  'passport_photo',
  'bank_passbook',
  'customer_email',
  'customer_mobile'
);

-- Create projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE UNIQUE,
  project_code TEXT NOT NULL UNIQUE,
  k_number TEXT,
  consumer_name TEXT,
  capacity_kw DECIMAL NOT NULL,
  panel_watt INTEGER NOT NULL,
  panel_qty INTEGER NOT NULL,
  panel_brand TEXT NOT NULL,
  inverter_capacity DECIMAL NOT NULL,
  inverter_brand TEXT NOT NULL,
  structure_type structure_type NOT NULL,
  final_amount DECIMAL NOT NULL,
  discount DECIMAL DEFAULT 0,
  payment_type payment_type NOT NULL,
  loan_bank TEXT,
  expected_install_date DATE,
  special_notes TEXT,
  status project_status NOT NULL DEFAULT 'pending_documents',
  documents_submitted_by_sales BOOLEAN NOT NULL DEFAULT false,
  documents_submitted_at TIMESTAMP WITH TIME ZONE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create documents table
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  document_type document_type NOT NULL,
  file_url TEXT,
  text_value TEXT,
  uploaded_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  is_verified BOOLEAN DEFAULT false,
  rejection_reason TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, document_type)
);

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Projects RLS
CREATE POLICY "Admins can manage all projects"
  ON public.projects FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Sales persons can view their projects"
  ON public.projects FOR SELECT
  USING (
    public.has_role(auth.uid(), 'sales_person')
    AND created_by_user_id = auth.uid()
  );

CREATE POLICY "Sales persons can create projects"
  ON public.projects FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'sales_person')
    AND created_by_user_id = auth.uid()
  );

CREATE POLICY "Sales persons can update own projects"
  ON public.projects FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'sales_person')
    AND created_by_user_id = auth.uid()
  );

CREATE POLICY "Operators can view all projects"
  ON public.projects FOR SELECT
  USING (public.has_role(auth.uid(), 'operator'));

CREATE POLICY "Operators can update projects"
  ON public.projects FOR UPDATE
  USING (public.has_role(auth.uid(), 'operator'));

-- Documents RLS
CREATE POLICY "Admins can manage all documents"
  ON public.documents FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Sales persons can manage own project documents"
  ON public.documents FOR ALL
  USING (
    public.has_role(auth.uid(), 'sales_person')
    AND uploaded_by_user_id = auth.uid()
  );

CREATE POLICY "Sales persons can view project documents"
  ON public.documents FOR SELECT
  USING (
    public.has_role(auth.uid(), 'sales_person')
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.created_by_user_id = auth.uid()
    )
  );

CREATE POLICY "Operators can view all documents"
  ON public.documents FOR SELECT
  USING (public.has_role(auth.uid(), 'operator'));

CREATE POLICY "Operators can update documents"
  ON public.documents FOR UPDATE
  USING (public.has_role(auth.uid(), 'operator'));

-- Triggers
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to generate project code
CREATE OR REPLACE FUNCTION public.generate_project_code()
RETURNS TEXT
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'MS-' || EXTRACT(YEAR FROM now())::TEXT || '-' ||
    LPAD((COALESCE(
      (SELECT COUNT(*)::INTEGER + 1 FROM public.projects
       WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now())),
      1
    ))::TEXT, 4, '0')
$$;

-- Storage bucket for project documents
INSERT INTO storage.buckets (id, name, public) VALUES ('project-documents', 'project-documents', false);

-- Storage policies
CREATE POLICY "Admins can access all documents"
  ON storage.objects FOR ALL
  USING (bucket_id = 'project-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Operators can download documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'project-documents' AND public.has_role(auth.uid(), 'operator'));

CREATE POLICY "Sales persons can upload documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'project-documents' AND public.has_role(auth.uid(), 'sales_person'));

CREATE POLICY "Sales persons can view own uploads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'project-documents' AND public.has_role(auth.uid(), 'sales_person'));

CREATE POLICY "Sales persons can update own uploads"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'project-documents' AND public.has_role(auth.uid(), 'sales_person'));
