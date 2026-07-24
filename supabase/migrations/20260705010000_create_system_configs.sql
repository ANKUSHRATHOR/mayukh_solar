-- Create system configurations table for storing dropdown options
CREATE TABLE IF NOT EXISTS public.system_configs (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.system_configs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow all authenticated users to read system configs" ON public.system_configs;
DROP POLICY IF EXISTS "Allow admins to manage system configs" ON public.system_configs;

-- RLS policies
CREATE POLICY "Allow all authenticated users to read system configs" ON public.system_configs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admins to manage system configs" ON public.system_configs
  FOR ALL TO authenticated 
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default plant details dropdown options
INSERT INTO public.system_configs (key, value)
VALUES (
  'plant_details_dropdown_options',
  '{
    "phase": ["Single Phase", "Three Phase"],
    "panel_make": ["Tata Power", "Adani Solar", "Waaree", "Vikram Solar", "Loom Solar"],
    "panel_wt": ["540W", "550W", "575W", "600W"],
    "inverter": ["Growatt", "Sofar", "Sungrow", "Solis", "Luminous"],
    "inverter_wt": ["3 kW", "5 kW", "8 kW", "10 kW", "15 kW", "20 kW"],
    "wiremake": ["Polycab", "Havells", "KEI", "Finolex"],
    "wire_size": ["4 sqmm", "6 sqmm", "10 sqmm", "16 sqmm"],
    "wire_material": ["Copper", "Aluminum"]
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
