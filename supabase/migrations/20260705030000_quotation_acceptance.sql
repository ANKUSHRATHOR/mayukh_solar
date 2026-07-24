-- Migration: Add quotation flow statuses to lead_status enum and new columns to leads

-- 1. Add new enum values to lead_status
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'quotation_sent';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'quotation_accepted';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'quotation_rejected';

-- 2. Add quotation response tracking columns to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS quotation_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quotation_response_message TEXT;

-- 3. Grant service-role INSERT on audit_logs (for webhook Edge Function to log without user session)
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.audit_logs;
CREATE POLICY "Service role can insert audit logs"
  ON public.audit_logs FOR INSERT
  TO service_role
  WITH CHECK (true);
