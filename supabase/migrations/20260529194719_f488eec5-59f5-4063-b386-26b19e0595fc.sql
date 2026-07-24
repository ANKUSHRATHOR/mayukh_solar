
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
--
-- `realtime.messages` is owned by supabase_realtime_admin on current Supabase
-- projects, so the migration role cannot ALTER it — and RLS is already enabled
-- there by default. Both statements are wrapped so a project where we lack
-- ownership skips them with a notice instead of failing the whole push.
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'realtime.messages RLS not owned by this role; already enabled by default.';
    WHEN undefined_table THEN
      RAISE NOTICE 'realtime.messages does not exist; skipping.';
  END;

  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Users subscribe to own notification topic" ON realtime.messages';
    EXECUTE $policy$
      CREATE POLICY "Users subscribe to own notification topic"
        ON realtime.messages
        FOR SELECT
        TO authenticated
        USING (realtime.topic() = 'user-notifications-' || auth.uid()::text)
    $policy$;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Cannot manage policies on realtime.messages from this role; skipping.';
    WHEN undefined_table THEN
      RAISE NOTICE 'realtime.messages does not exist; skipping.';
  END;
END $$;
