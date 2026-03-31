
-- Add net metering fields to projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS net_metering_file_number text,
  ADD COLUMN IF NOT EXISTS inspection_date date,
  ADD COLUMN IF NOT EXISTS inspection_notes text,
  ADD COLUMN IF NOT EXISTS net_meter_number text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;
