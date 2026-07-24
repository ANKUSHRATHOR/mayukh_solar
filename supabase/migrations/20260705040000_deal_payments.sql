-- Create project_payments table
CREATE TABLE IF NOT EXISTS public.project_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('customer', 'bank')),
    amount NUMERIC NOT NULL CHECK (amount >= 0),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cash', 'bank_transfer', 'cheque', 'upi', 'other')),
    reference_number TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'rejected')) DEFAULT 'completed',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.project_payments ENABLE ROW LEVEL SECURITY;

-- Policies for project_payments
DROP POLICY IF EXISTS "Allow authenticated users to read project payments" ON public.project_payments;
CREATE POLICY "Allow authenticated users to read project payments" ON public.project_payments
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert project payments" ON public.project_payments;
CREATE POLICY "Allow authenticated users to insert project payments" ON public.project_payments
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update project payments" ON public.project_payments;
CREATE POLICY "Allow authenticated users to update project payments" ON public.project_payments
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to delete project payments" ON public.project_payments;
CREATE POLICY "Allow authenticated users to delete project payments" ON public.project_payments
    FOR DELETE TO authenticated USING (true);
