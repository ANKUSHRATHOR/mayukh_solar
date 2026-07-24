-- PM Surya Ghar: Muft Bijli Yojana central subsidy is slab-based by sanctioned
-- capacity, not a flat amount. The app previously hardcoded ₹78,000 everywhere,
-- which over-quoted the subsidy for every system under 3 kW.
--
-- Stored in system_configs so admins can update it when the scheme changes and
-- so server-side code (edge functions) can read the same slabs the client uses.
-- src/lib/subsidy.ts carries an identical fallback table.
--
-- Slabs are ascending; max_kw is an inclusive upper bound, null means "and above".
INSERT INTO public.system_configs (key, value)
VALUES (
  'pm_surya_ghar_subsidy',
  '{
    "slabs": [
      { "max_kw": 1,    "amount": 30000 },
      { "max_kw": 2,    "amount": 60000 },
      { "max_kw": null, "amount": 78000 }
    ],
    "effective_from": "2024-02-13"
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
