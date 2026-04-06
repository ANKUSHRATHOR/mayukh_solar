
-- 1. Fix notifications INSERT policy: remove open policy, add restricted one
-- Notifications are inserted by SECURITY DEFINER triggers, so we just need to prevent direct client inserts for other users
DROP POLICY IF EXISTS "Authenticated can insert notifications" ON public.notifications;

-- Allow users to only insert notifications for themselves (edge case for self-notifications)
CREATE POLICY "Users can only insert own notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- 2. Fix storage policies for sales persons - scope by project ownership
-- Drop existing overbroad policies
DROP POLICY IF EXISTS "Sales persons can view own uploads" ON storage.objects;
DROP POLICY IF EXISTS "Sales persons can update own uploads" ON storage.objects;

-- Recreate with ownership check via documents table
CREATE POLICY "Sales persons can view project documents they uploaded"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'project-documents'
  AND public.has_role(auth.uid(), 'sales_person')
  AND EXISTS (
    SELECT 1 FROM public.documents d
    JOIN public.projects p ON p.id = d.project_id
    WHERE p.id::text = (storage.foldername(name))[1]
    AND p.created_by_user_id = auth.uid()
  )
);

CREATE POLICY "Sales persons can update project documents they uploaded"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'project-documents'
  AND public.has_role(auth.uid(), 'sales_person')
  AND EXISTS (
    SELECT 1 FROM public.documents d
    JOIN public.projects p ON p.id = d.project_id
    WHERE p.id::text = (storage.foldername(name))[1]
    AND p.created_by_user_id = auth.uid()
  )
);
