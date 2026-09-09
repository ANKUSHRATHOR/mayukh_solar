-- Branding assets and the standing bill of material for the quotation document.
--
-- The letterhead and the signature block are designed for images but must render
-- deliberately without them, so both columns are nullable with no backfill.
--
-- The bucket is public on purpose: html2canvas fetches these at render time and a
-- signed URL would expire mid-document. A firm logo and a signature block are not
-- secrets; writes stay admin-only.

ALTER TABLE public.vendor_profiles
  ADD COLUMN IF NOT EXISTS logo_url      text,
  ADD COLUMN IF NOT EXISTS signature_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Branding is publicly readable" ON storage.objects;
CREATE POLICY "Branding is publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "Admins manage branding" ON storage.objects;
CREATE POLICY "Admins manage branding" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'branding' AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'branding' AND has_role(auth.uid(), 'admin'::app_role));

-- Rows 4-10 of the sample's bill of material: the same components on every quote,
-- with brands that do change (Havells, Schneider), so they are settings rather
-- than code. Rows 1-3 are generated from the quotation's own specs.
INSERT INTO public.system_configs (key, value)
VALUES ('quotation_bom_rows', '[
  {"description":"ACDB-DCDB","spec":"SPD: Phoenix, Fuses: Havells, MCB: Schneider/Havells/Elemex/Siebaas/VG","qty":"1 Set"},
  {"description":"Earthing Kit","spec":"True Power, Dia: 14mm, Length: 1m","qty":"3 Nos"},
  {"description":"Accessories","spec":"MC4, Cable Tray, Ferrules, Conduits, Tools, etc.","qty":"1 Set"},
  {"description":"Electrical Conduits & Accessories","spec":"Reputed Make","qty":"As Required"},
  {"description":"Lightning Arrester (LA)","spec":"Reputed Make","qty":"1 Unit"},
  {"description":"Design & Installation","spec":"As per MNRE/IS Standards","qty":"Included"}
]'::jsonb)
ON CONFLICT (key) DO NOTHING;
