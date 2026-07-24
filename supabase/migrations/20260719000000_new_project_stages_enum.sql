-- Step 1 of the pipeline redesign: add the new project_status values.
--
-- This migration ONLY adds enum values. Postgres will not let a newly added
-- enum value be referenced in the same transaction that created it, so the
-- data mapping and function rewrites live in the next migration.
--
-- Nothing is removed: enum values cannot be dropped in Postgres, and the old
-- values must survive until every row has been mapped off them. They are
-- retired at the application layer instead — see src/lib/projectStages.ts.
--
-- New pipeline (12 stages):
--   New Project → Documents Pending → Documents Approved
--     → [loan only] Loan Application Pending → Loan Approved
--     → Installation Scheduled → Installation Completed
--     → Net Meter Applied → Net Meter Installed
--     → Payment Pending → Project Completed → Closed
--
-- Wiring, material dispatch and inspection are no longer top-level stages;
-- they become sub-steps within Installation so the welder and electrician
-- workflows keep functioning.

ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'new_project';
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'documents_pending';
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'documents_approved';
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'loan_application_pending';
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'loan_approved';
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'installation_scheduled';
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'installation_completed';
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'net_meter_applied';
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'payment_pending';
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'closed';

-- Already present, listed for completeness: net_meter_installed, project_completed.
