## Scope

This is a large multi-domain build. I'll deliver it in one migration + a set of focused frontend changes, reusing the existing tables (`attendance`, `attendance_events`, `salary_*`, `audit_logs`, `quotations`).

---

## 1. Attendance image UX (mobile-first)

Rebuild capture flow in `src/pages/Attendance.tsx`:
- Native `<input type="file" accept="image/*" capture="environment">` (works on every Android/iOS without WebRTC quirks).
- In-browser compression via `browser-image-compression` (max 1600px, ~0.8 quality, target ≤400 KB) — preserves readability of bike meter.
- Blur detection: Laplacian variance on a downscaled canvas; warn (not block) if score < threshold.
- Preview card with **Retake** / **Confirm & Upload** buttons.
- Upload progress using XHR-backed signed-upload (`supabase.storage ... .upload()` with `onUploadProgress`-style chunking via fetch + a manual progress bar tied to compression + upload phases). No page refresh — TanStack mutation only.

## 2. Audit log system

Reuse `audit_logs` (already present) + add triggers for the gaps:
- `audit_lead_insert_update` — captures lead create + edit (diff of changed columns).
- `audit_document_decision` — captures verify/reject.
- `audit_attendance_event_change` — captures admin rejections / reuploads.
- `audit_salary_change` — on `salary_profiles` upsert and `salary_runs` insert.
- `audit_login` — client-side: on successful login + logout, call `log_user_event(_action, _meta)` RPC that writes to `audit_logs` with `ip`/`user_agent` captured server-side via `current_setting('request.headers')` best-effort + client-sent UA.
- New admin page `/audit-logs` already exists as `ActivityLogs.tsx` — extend it to show user_name, action, entity, timestamp, device. Admin-only RLS already in place.

## 3. Salary management upgrades

Extend tables (additive):
- `salary_advances` (staff_user_id, amount, given_on, note, created_by).
- `salary_runs` add `advance_deduction numeric default 0`, `paid_amount numeric default 0`, `status text default 'pending'` (`pending|partial|paid`), `paid_at`, `paid_by`.

Update `compute_salary` to subtract outstanding (un-deducted) advances and set status='pending'. Add `mark_salary_paid(_run_id, _amount)` RPC that flips status to `paid`/`partial`.

UI (`SalaryManagement.tsx`): add Advances tab, Mark Paid / Partial buttons, payroll history filter, and CSV export.

## 4. CSV / Excel exports

Single utility `src/lib/exportCsv.ts` (header-aware, BOM for Excel). Admin "Export" buttons added on:
- AdminAttendance (month filtered).
- SalaryManagement (month).
- AdminLeadsList.
- QuotationsList.
- AdminProjects.
- StaffManagement → "Performance" (leads created, leads converted, projects completed, attendance %, salary YTD) via new RPC `staff_performance(_from, _to)`.

Excel = same CSV with `.xls` mime — opens cleanly in Excel; avoids extra deps.

## 5. Staff monthly attendance dashboard

New page `src/pages/MyAttendance.tsx` (staff) + reuse `AdminAttendance.tsx` (admin already has per-staff month view). Calendar grid (date-fns) colored by status, KPI cards (present/half/late/absent/work hours/attendance %). Staff sees only own (RLS already enforces this).

## 6. Geo-fencing

New table `attendance_geofences` (id, name, lat, lng, radius_m, is_active). Admin UI in `SettingsPage.tsx` → "Attendance locations" (lat/lng + radius, with "Use my location" helper).

Server enforcement via new RPC `punch_attendance(kind, lat, lng, accuracy, image_path, reading)`:
- Validates against active geofences (haversine in SQL); raises if outside all of them.
- Also enforces no duplicate same-kind punch within 5 minutes.
- Inserts the `attendance_events` row. Client stops doing direct INSERT — guarantees the rule cannot be bypassed.

If no geofence is configured, fall back to "any location allowed" so existing setups don't break.

## 7. PDF quotation extraction

New edge function `parse-quotation-pdf`:
- Accepts a `multipart/form-data` PDF upload (max 10 MB).
- Uses `unpdf` (pure-JS) to extract text.
- Regex pass: `GSTIN[: ]*([0-9A-Z]{15})`, `Mob[il. ]*\+?91[- ]?(\d{10})`, IFSC `[A-Z]{4}0[A-Z0-9]{6}`, account no, firm name (first non-empty heading line), address (lines until phone/GSTIN).
- Returns structured JSON.

New page `src/pages/QuotationImport.tsx` (admin): upload PDF, review extracted fields, save into a new `vendor_profiles` table (firm_name, gstin, address, mobile, bank_name, account_no, ifsc, account_type, raw_text). Quotation generator then reads default vendor profile so quotations issued show real GSTIN/address/bank.

## 8. Auto T&C templates

New table `quotation_terms_templates` (id, title, body, section_order, is_default, is_active). Admin CRUD in `SettingsPage.tsx` → "Quotation T&C". `generate-quotation` edge function fetches all `is_active` templates ordered by `section_order` and injects them into the PDF (replaces hard-coded list). Default seed: Warranty, Payment, Delivery, AMC, Legal Jurisdiction (Kota).

## 9. Performance / security

- All new mutations behind RPCs with `SECURITY DEFINER` + explicit role checks.
- TanStack Query everywhere; no `setInterval` polling.
- `attendance_events` unique partial index `(staff_user_id, kind, (captured_at AT TIME ZONE 'Asia/Kolkata')::date) WHERE NOT is_rejected` to prevent duplicate punches.
- Storage: keep `attendance-media` and `project-documents` private; signed URLs only.

---

## Technical notes (SQL highlights)

```sql
-- geofence check
CREATE OR REPLACE FUNCTION public.punch_attendance(...)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inside boolean; ...
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM attendance_geofences g WHERE g.is_active
    AND 6371000 * acos(
      cos(radians(g.lat))*cos(radians(_lat))*cos(radians(_lng)-radians(g.lng))
      + sin(radians(g.lat))*sin(radians(_lat))
    ) <= g.radius_m
  ) INTO inside;
  IF NOT inside AND EXISTS(SELECT 1 FROM attendance_geofences WHERE is_active) THEN
    RAISE EXCEPTION 'Outside allowed location';
  END IF;
  ...
END $$;
```

## Out of scope this turn
- Native push for attendance alerts (already wired via existing `notifications` trigger).
- Server-side blur ML (client heuristic only).
- True .xlsx (using CSV-with-xls-mime; user explicitly said "if possible").

---

Ready to execute. Approve and I'll start with the migration, then ship UI + edge functions.