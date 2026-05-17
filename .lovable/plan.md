# Implementation Plan

This is a large multi-feature build. I'll ship it in 3 phases so each piece is stable before the next.

## Phase 1 — Lead Visibility (small, ship first)

**Problem:** Lead detail shows current user's name everywhere because joins to `staff` aren't being fetched (no FK = PostgREST embedded select fails silently).

**Backend**
- New RPC `get_lead_people(_lead_id uuid)` (SECURITY DEFINER) returning creator, currently-assigned sales person, and last 20 reassignment events with from/to/changed-by names — all resolved against `staff`. Uses the `lead_assignments` table from the last migration.
- RLS check inside the RPC: caller must be admin, the creator, currently assigned, or have a project linked to that lead.

**Frontend**
- `src/pages/LeadDetail.tsx`: replace local user-name placeholders with data from the new RPC. Render three cards: "Created by", "Currently assigned to" (with mobile/email), and "Assignment history" (timeline).

## Phase 2 — Attendance + Bike Meter + GPS

**New tables**
- `attendance` — one row per staff per day: `staff_user_id, date, check_in_at, check_out_at, status (present|absent|half_day|late), worked_minutes (generated), overtime_minutes, notes`.
- `attendance_events` — every check-in/out punch with `attendance_id, kind (check_in|field_visit|check_out), captured_at, latitude, longitude, accuracy_m, bike_meter_image_path, bike_meter_reading, is_rejected, rejection_reason, replaced_by_event_id`.
- `salary_profiles` — `staff_user_id, monthly_salary, per_day_rate (generated = salary/working_days), overtime_hourly_rate, effective_from`.
- `salary_runs` — admin-generated monthly summary: `staff_user_id, year, month, present_days, half_days, absent_days, late_days, overtime_minutes, gross, deductions, net, generated_at, generated_by`.

**Storage**
- New private bucket `attendance-media`. Path: `{staff_user_id}/{yyyy-mm-dd}/{event_id}.jpg`.
- RLS: staff can read/write only their own folder; admins read all.

**RLS / triggers**
- Staff: SELECT/INSERT own attendance + events; UPDATE only their own non-rejected event of the current day (for reupload).
- Admin: full access.
- Trigger on `attendance_events` INSERT: derive/upsert the matching `attendance` row, compute `status` (late if check_in > 10:00, half_day if worked < 4 h, present if ≥ 6 h), and update `check_in_at` / `check_out_at`.
- Trigger on `attendance_events` UPDATE when `is_rejected=true`: insert a notification to the staff member ("Your bike meter image was rejected — please reupload").
- RPC `compute_salary(_user uuid, _year int, _month int)` (admin only) that aggregates attendance + overtime against the staff member's active `salary_profile` and inserts a `salary_runs` row.

**Frontend**
- `src/pages/Attendance.tsx` (staff): big "Check In" / "Check Out" buttons. On press → request camera + geolocation, capture photo (using `getUserMedia` with `facingMode: environment` and `<input type="file" accept="image/*" capture="environment">` fallback for mobile), show preview, allow Retake, then upload to storage and insert event with lat/lng. Today's status card + last 30 days list.
- `src/pages/admin/AttendanceReports.tsx` (admin only): staff filter, month picker, table with present/absent/half/late counts, hours, overtime, map-link per event (`https://www.google.com/maps?q=lat,lng`), thumbnail of bike meter, Reject button, Generate Salary button per row/month.
- `src/pages/admin/SalaryManagement.tsx` (admin only): manage `salary_profiles`, run monthly compute, view/export `salary_runs`.
- Navigation links gated by role in `AppSidebar.tsx`.

**Anti-tamper**
- Latitude/longitude come from `navigator.geolocation.getCurrentPosition` at submit time, sent server-side; the form has no editable lat/lng input.
- `accuracy_m` stored — admins can flag low-accuracy entries.
- Photo MIME enforced (`image/jpeg` or `image/png`), max 5 MB, stored in private bucket so URL forging is blocked.
- File path includes auth.uid() folder, enforced by storage RLS — staff cannot write into another user's folder.

## Phase 3 — Image Reupload + Rejection Flow

- Same-day, not-yet-rejected event: staff can call RPC `reupload_event_image(_event_id, _new_path, _new_lat, _new_lng)` which marks the old event row `replaced_by_event_id` and inserts a fresh event, preserving history.
- Admin reject action: marks event `is_rejected=true`, sets `rejection_reason`; trigger sends notification; staff sees a "Reupload" CTA on that day's card.
- History view (admin): all events for a date including superseded/rejected ones, with reasons and timestamps.

## Technical notes

- Realtime stays off for attendance to avoid extra connections; staff page uses `react-query` with manual invalidation after upload.
- All new RLS uses `has_role()` (no recursion).
- All new RPCs are `SECURITY DEFINER` with `SET search_path = public` and explicit role checks in the body.
- No changes to existing auth, notification, or quotation logic.

## What I won't include unless you ask

- Geofencing / "must be at office" check
- ML-based blur detection (will only do basic min-resolution + min-filesize warning client-side)
- PDF salary-slip generation (will export CSV; PDF is a follow-up)
- Bulk admin import of past attendance

Reply with **go** to ship Phase 1 first, or tell me which phase to start with / change.