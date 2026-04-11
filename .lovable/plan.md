

## Security Hardening Plan

### What's already solid
The app has comprehensive RLS on all tables, server-side audit logging, role-based access scoped by ownership, mandatory password changes, and admin limits. The database linter reports zero issues.

### Remaining items to fix

**1. Lock down notifications INSERT to server-side only**
- Drop the client INSERT policy on `notifications`
- All notification creation already happens via SECURITY DEFINER triggers (lead assigned, worker assigned, document rejected, project status change)
- No client code needs to insert notifications directly

**2. Add storage DELETE policy for sales persons**
- Add a DELETE policy on `storage.objects` for `project-documents` bucket scoped to `(storage.foldername(name))[1] = auth.uid()::text` and role = sales_person

**3. Enable Leaked Password Protection**
- This is a manual setting: go to Cloud → Users → Auth Settings → Email settings → enable Password HIBP Check
- Prevents staff from using passwords found in data breaches

### Technical details

**Migration SQL:**
```sql
-- 1. Remove client INSERT on notifications (triggers handle all inserts)
DROP POLICY IF EXISTS "Users can only insert own notifications" ON public.notifications;

-- 2. Sales person storage DELETE policy
CREATE POLICY "Sales persons can delete own documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'project-documents'
  AND has_role(auth.uid(), 'sales_person'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

**No frontend changes needed.**

### What this does NOT cover (already handled)
- Audit log forgery — already server-side triggers
- Staff self-escalation — already locked via WITH CHECK
- Cross-user data access — already scoped by RLS
- Realtime eavesdropping — mitigated by table-level RLS

