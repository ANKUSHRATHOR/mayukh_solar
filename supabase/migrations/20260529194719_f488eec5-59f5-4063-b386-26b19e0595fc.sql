
-- 1) Remove legacy uid-folder-scoped and creator-scoped sales policies on storage.objects
DROP POLICY IF EXISTS "Sales persons can view own uploads" ON storage.objects;
DROP POLICY IF EXISTS "Sales persons can update own uploads" ON storage.objects;
DROP POLICY IF EXISTS "Sales persons can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Sales persons can delete own documents" ON storage.objects;
DROP POLICY IF EXISTS "Sales persons can view project documents they uploaded" ON storage.objects;
DROP POLICY IF EXISTS "Sales persons can update project documents they uploaded" ON storage.objects;
DROP POLICY IF EXISTS "Sales persons can upload project documents they created" ON storage.objects;

-- 2) Remove operator SELECT access from vendor_profiles (financial fields)
DROP POLICY IF EXISTS "Admin/operator read vendor profiles" ON public.vendor_profiles;

-- 3) Restrict realtime channel subscriptions to user's own notification topic
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users subscribe to own notification topic" ON realtime.messages;
CREATE POLICY "Users subscribe to own notification topic"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() = 'user-notifications-' || auth.uid()::text
  );
