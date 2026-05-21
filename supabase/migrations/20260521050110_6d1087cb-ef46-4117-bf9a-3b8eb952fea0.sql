
-- Bank accounts
CREATE TABLE IF NOT EXISTS public.vendor_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name text NOT NULL,
  holder_name text NOT NULL,
  account_no text NOT NULL,
  ifsc text NOT NULL,
  branch_name text,
  upi_image_url text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vendor_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage bank accounts" ON public.vendor_bank_accounts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Staff read active bank accounts" ON public.vendor_bank_accounts
  FOR SELECT TO authenticated
  USING (is_active = true);

CREATE TRIGGER update_vendor_bank_accounts_updated_at
  BEFORE UPDATE ON public.vendor_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Only one default at a time
CREATE OR REPLACE FUNCTION public.ensure_single_default_bank()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.vendor_bank_accounts SET is_default=false WHERE id<>NEW.id AND is_default=true;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_single_default_bank
  AFTER INSERT OR UPDATE OF is_default ON public.vendor_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_bank();

-- Extend quotations
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS quotation_type text NOT NULL DEFAULT 'consumer'
    CHECK (quotation_type IN ('bank','consumer')),
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES public.vendor_bank_accounts(id),
  ADD COLUMN IF NOT EXISTS payment_schedule jsonb;

-- Allow operators to create quotations
CREATE POLICY "Operators can create quotations" ON public.quotations
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'operator'::app_role) AND created_by_user_id = auth.uid());
