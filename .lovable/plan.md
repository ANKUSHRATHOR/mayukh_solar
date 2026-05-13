## Overview

Four interlocking fixes across auth, RLS, assignment logic, and document access. Below is what I'll change and why, then the exact technical steps.

---

## 1. Staff Re-Add / Password Reset

**Problem:** Deleting a staff row leaves the auth.users record (or vice versa), so re-adding with same mobile silently fails to log in. Also, no proper reset flow.

**Fix:**
- Harden `update-staff` delete: delete in correct order (user_roles → staff → auth user), and tolerate orphans (if auth user missing, skip; if staff row missing, still purge auth).
- Harden `create-staff` re-add: if an auth user already exists for that mobile-email, fully reset it (password + `must_change_password=true`) AND clean up any stale `user_roles` / `staff` rows before re-inserting.
- Add an Admin-visible **"Reset Password"** button in Staff Management that calls `update-staff` action `reset_password` (already exists) and shows the temp password once in a copyable dialog.
- Keep the existing `/set-password` forced-change flow — that already works on next login.

---

## 2. Lead Status Update Error (Sales Person)

**Problem:** Sales person UPDATE policy on `leads` allows update but the row-level audit trigger / status enum transitions may reject. Most commonly: the policy lacks a `WITH CHECK`, so Postgres rejects updates that change values. Also `notify_lead_assigned` fires on UPDATE and writes to `notifications` which has no INSERT policy — but it's `SECURITY DEFINER`, so that's fine. Real culprit is the missing `WITH CHECK` clause.

**Fix:**
- Replace the sales-person UPDATE policy on `leads` with one that has both `USING` and `WITH CHECK`, ensuring sales person stays the assignee after update (prevents reassignment escalation).
- Same audit pass for `projects` sales-person UPDATE.

---

## 3. Dynamic Project Assignment

**Problem:** `projects.assigned_sales_person_id` is the only assignment field surfaced; admin can't assign Telecaller/Operator on creation flow. Welder/Electrician fields exist but aren't part of the unified picker.

**Fix (scalable approach):**
- Keep the existing role-specific FK columns (`assigned_sales_person_id`, `assigned_welder_id`, `assigned_electrician_id`) — they're already wired to RLS.
- Add `assigned_telecaller_id` and `assigned_operator_id` columns + matching RLS SELECT/UPDATE policies mirroring the existing pattern.
- Update Admin's project edit UI (`ProjectFinalizationForm` / `AdminProjects`) with an **"Assignments"** section showing one staff dropdown per role, populated from `staff` filtered by `user_roles.role`.
- Telecaller permission: add an INSERT/UPDATE policy allowing telecallers to set only `assigned_sales_person_id` on projects they created.

---

## 4. Operator Document Access

**Problem:** Operator already has SELECT on `documents` and `quotations` table-side, but the `project-documents` storage bucket has no operator policy, so signed URLs / downloads fail.

**Fix:**
- Add storage RLS policies on `storage.objects` for bucket `project-documents` granting operators SELECT (view/download) on all objects, plus admins full access.
- Confirm `OperatorProjectDetail` UI exposes the documents list with view/download/share actions; add a "Share" action (Web Share API on mobile, copy-link fallback on web) that uses a signed URL.

---

## Technical Steps

### Migration (one batch)

```sql
-- 1. New assignment columns
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS assigned_telecaller_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_operator_id uuid;

-- 2. RLS for new roles on projects (SELECT + UPDATE)
CREATE POLICY "Telecallers view assigned projects" ON public.projects
  FOR SELECT USING (has_role(auth.uid(),'telecaller') AND assigned_telecaller_id = auth.uid());
CREATE POLICY "Operators view their assigned projects" ON public.projects
  FOR SELECT USING (has_role(auth.uid(),'operator') AND assigned_operator_id = auth.uid());
-- (operator already has blanket SELECT — this is additive, harmless)

-- 3. Fix sales-person UPDATE on leads (add WITH CHECK)
DROP POLICY "Sales persons can update assigned leads" ON public.leads;
CREATE POLICY "Sales persons can update assigned leads" ON public.leads
  FOR UPDATE
  USING (has_role(auth.uid(),'sales_person') AND is_in_bin = false AND assigned_to_user_id = auth.uid())
  WITH CHECK (has_role(auth.uid(),'sales_person') AND assigned_to_user_id = auth.uid());

-- 4. Same fix on projects sales-person UPDATE
DROP POLICY "Sales persons can update assigned projects" ON public.projects;
CREATE POLICY "Sales persons can update assigned projects" ON public.projects
  FOR UPDATE
  USING (has_role(auth.uid(),'sales_person') AND assigned_sales_person_id = auth.uid())
  WITH CHECK (has_role(auth.uid(),'sales_person') AND assigned_sales_person_id = auth.uid());

-- 5. Storage policies for operators on project-documents bucket
CREATE POLICY "Operators can view project documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'project-documents' AND has_role(auth.uid(),'operator'));
CREATE POLICY "Admins manage project documents" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'project-documents' AND has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'project-documents' AND has_role(auth.uid(),'admin'));
-- (sales person policies left unchanged)
```

### Edge Function changes
- `create-staff`: when an existing auth user is found, also delete any stale `user_roles` and `staff` rows for that user_id before re-inserting; ensure `must_change_password=true` and password reset. Return clear error if mobile is in use by an active staff record.
- `update-staff` (delete action): swallow "user not found" errors from `auth.admin.deleteUser` so partial state can still be cleaned.

### Frontend
- `StaffManagement.tsx`: add **Reset Password** button per staff row → calls `update-staff` with `action: "reset_password"` → shows modal with the temp password and "Copy".
- `ProjectFinalizationForm.tsx` (admin only): add Assignments section with 5 dropdowns (Telecaller, Sales Person, Operator, Welder, Electrician), each populated by querying staff filtered by role.
- `OperatorProjectDetail.tsx`: surface documents list (read from `documents` + `quotations` tables), add View/Download/Share buttons. Share uses `navigator.share` if available, else copies signed URL.

### Verification
- Admin resets a staff password → staff logs in with temp → forced to set new password.
- Admin deletes + re-adds a staff with same mobile → can log in with new temp pin.
- Sales person opens an assigned lead → changes status → saves without RLS error.
- Admin opens a project → assigns a Telecaller and an Operator → both see the project on their dashboard.
- Operator opens an assigned project → views, downloads, and shares a document.

---

## Out of scope
- Rebuilding the entire role system as a generic many-to-many (current per-role FK approach is faster, RLS-friendlier, and matches existing UI).
- Email-based password reset (the app uses mobile-OTP; password reset for staff is admin-driven via temp password, which matches the rest of the system).