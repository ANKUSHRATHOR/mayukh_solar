-- Give a project somewhere to keep the plant specs a lead already records.
--
-- `leads.plant_details` (JSONB) captures phase, wire make/size/material and the
-- subsidy alongside the panel and inverter specs. The projects table has typed
-- columns for the panel and inverter only, so the moment a lead is converted
-- the phase and the wiring specification are dropped — the two things a welder
-- and an electrician actually need on site.
--
-- All additive and nullable, so no backfill and nothing existing breaks
-- whichever order the code and the migration land in.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS phase           text,
  ADD COLUMN IF NOT EXISTS wiremake        text,
  ADD COLUMN IF NOT EXISTS wire_size       text,
  ADD COLUMN IF NOT EXISTS wire_material   text,
  ADD COLUMN IF NOT EXISTS subsidy_amount  numeric;

COMMENT ON COLUMN public.projects.phase IS
  'Grid phase, e.g. "Single Phase". Mirrors leads.plant_details->>''phase''.';
COMMENT ON COLUMN public.projects.subsidy_amount IS
  'PM Surya Ghar subsidy applied to this project. final_amount stays the amount payable.';
