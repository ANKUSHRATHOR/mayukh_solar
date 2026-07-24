-- REDESIGN AND FEATURE ADDITIONS MIGRATION — part 1 of 2
--
-- Only adds the enum value and the JSONB columns. Postgres will not allow a
-- newly added enum value to be *referenced* in the same transaction that added
-- it, and the CLI wraps each migration file in one transaction. The RLS
-- policies that compare against 'visit_created' therefore live in
-- 20260705000500_add_plant_details_policies.sql, which runs immediately after
-- this one has committed.

-- 1. Add 'visit_created' to lead_status enum
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'visit_created';

-- 2. Add plant_details and quotation_details JSONB columns to public.leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS plant_details jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS quotation_details jsonb DEFAULT '{}'::jsonb;
