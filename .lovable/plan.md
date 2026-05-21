# Implementation Plan

This is a large multi-module change. I'll ship it in cohesive phases. Each phase = one migration + matching frontend updates.

## Phase 1 — Quotation: roles, type popup (Bank vs Consumer), bank selection

**DB (migration)**
- New table `vendor_bank_accounts` (bank_name, holder_name, account_no, ifsc, branch, upi_image_url, is_default, is_active). Admin RLS + read for staff.
- Extend `quotations` with: `quotation_type` ('bank' | 'consumer'), `bank_account_id`, `payment_schedule jsonb`.
- Update RLS on `quotations` so **operators** can also INSERT.

**Edge function `generate-quotation`**
- Accept `{ projectId, quotationType: 'bank'|'consumer', bankAccountId? }`.
- If `bank`: schedule = [{stage:'100% Advance', amount:total}].
- If `consumer`: 30/60/10 schedule.
- Pull selected bank account; render in PDF (replaces default vendor bank block).
- Save `quotation_type`, `bank_account_id`, `payment_schedule` on insert.

**Frontend**
- `QuotationButton`: open Dialog → choose Bank/Consumer → if Bank, pick from banks dropdown → generate.
- Gate the button to roles: `admin | operator | sales_person`.
- `QuotationsList`: keep Open/Download/Share buttons; ensure Share uses Web Share API (sales).
- Admin Settings → new "Bank Accounts" tab (CRUD + set default).

## Phase 2 — Field Visit (sales) + Consumer Home Location

**DB**
- New `field_visits` table: project_id (nullable), lead_id (nullable), staff_user_id, latitude, longitude, accuracy_m, bike_meter_image_path, notes, visit_outcome enum (interested, unavailable, docs_pending, site_issue, payment_discussion, bank_followup, other), created_at. Storage uses existing `attendance-media` bucket.
- RLS: sales insert/select own; admin/operator full.
- Extend `projects` with `home_latitude`, `home_longitude`, `home_location_saved_by`, `home_location_saved_at`.

**Frontend**
- New `FieldVisit.tsx` page (sales) — capture location + bike meter photo + notes + outcome.
- In project detail (sales): "Save Consumer Home Location" button → captures current GPS.
- Admin/Operator project view: show map link (Google Maps) + "Navigate" button.

## Phase 3 — Special Punch-Out Request (sales)

**DB**
- New `punch_out_requests` table: staff_user_id, latitude, longitude, reason, status enum ('pending','approved','rejected'), reviewed_by, reviewed_at, created_at.
- RLS: sales insert/select own; admin full.
- RPC `request_special_punch_out(_lat,_lng,_reason)` → inserts row + notification to all admins.
- RPC `approve_punch_out_request(_id)` / `reject_punch_out_request(_id,_reason)` — admin only; on approve, allows next punch_attendance to bypass geofence (set short-lived flag in row).
- Modify `punch_attendance`: for sales, check for an approved unused request in last 30 min; if present, skip geofence and mark request consumed.

**Frontend**
- In Attendance page (sales): "Request Outside Punch-Out" button when outside geofence.
- Admin: new panel in AdminAttendance to approve/reject pending requests.

## Phase 4 — Task / Job Assignment Module

**DB**
- New `tasks` table: title, description, priority enum ('low','medium','high','urgent'), due_date, status enum ('pending','in_progress','completed'), assigned_to_user_id, assigned_by_user_id, project_id (nullable), lead_id (nullable), proof_image_path, notes, completed_at.
- RLS: admin/operator insert+update; assignee select+update (own status/proof/notes).

**Frontend**
- `Tasks.tsx` (sales view — assigned to me).
- `TaskAssignment.tsx` (admin/operator — create + list).
- Sidebar entry for both.

## Phase 5 — Password Reset & Recovery

**DB**
- Extend `staff` with `temp_password_plain` (text, admin-only via RLS — masked), `temp_password_issued_at`, `temp_password_issued_by`.
- Add `password_reset_logs` table.
- RLS on `staff.temp_password_plain`: only admin can SELECT.

**Edge function `reset-staff-password`** (admin)
- Generate strong 10-char temp password.
- Use service role `admin.updateUserById` to set password.
- Set `must_change_password=true`, store temp password + log.
- Return temp password to admin in response.

**Frontend**
- StaffManagement → "Reset Password" button → shows generated temp password modal (copy button).
- "View Last Temp Password" (admin) on staff row.
- Reset log history page.

## Phase 6 — Attendance Punch UI Fix

**Frontend only**
- Rebuild Attendance.tsx punch card: responsive grid, properly sized buttons, no text overflow, larger touch targets on mobile, loading states, single-submit guard.

---

## Technical notes

- All status changes via DB triggers (per memory rule).
- All schedules/totals respect existing 8.9% GST extraction.
- Notifications use existing `notifications` table + DB triggers.
- All new file uploads use `attendance-media` (private) bucket with signed URLs.
- Storage paths: `field-visits/{user_id}/...`, `tasks/{user_id}/...`.
- Will fix `src/integrations/supabase/types.ts` is regenerated automatically — no manual edits.

## Delivery order in this session

Given the scope, I'll deliver Phases 1–6 in order, each as a migration then code. After Phase 1 you'll see Bank vs Consumer working; subsequent phases build on top. I'll keep you updated phase by phase.
