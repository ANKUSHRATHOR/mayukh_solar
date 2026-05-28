
# Master Enhancements Plan

Large scope — I'll break into 6 phases. Each phase is shippable on its own. Confirm and I'll execute phase-by-phase (or pick which to start).

---

## Phase A — Attendance: Late + OT engine

**DB (migration):**
- Add settings table `attendance_policy` (singleton): `late_after TIME default '10:05'`, `standard_minutes int default 480`.
- Update `compute_attendance_status` trigger / function:
  - If `check_in_at::time > late_after` → status = `late` (unless already half_day/absent rules).
  - `worked_minutes` already exists; add generated/derived `overtime_minutes = GREATEST(worked_minutes - 480, 0)` on punch-out.
- Backfill existing rows.

**UI:**
- `MyAttendance` + `AdminAttendance`: show **Worked**, **OT hrs**, **Late count**, **Summary** tiles.
- Color OT bar in calendar cell.

---

## Phase B — Category-wise Staff Management

Refactor `StaffManagement.tsx` into tabs (shadcn `Tabs`):
- Admin · Sales · Telecaller · Operator · Installation (welder + electrician grouped).
- Per tab: search, filter (active/inactive), card grid (mobile) + table (desktop).
- Each row links to a new `StaffDetail` page with: profile, attendance summary, KM total, assigned projects/leads, quotations created, task status, **password panel (admin only)**.

---

## Phase C — Sales Bike KM auto-calc

**DB:**
- New table `bike_readings` (`staff_user_id, date, morning_km, evening_km, distance_km generated, created_at`).
- Unique `(staff_user_id, date)`.
- Trigger: on punch-in event with `bike_meter_reading` → upsert morning. On punch-out / field visit end → upsert evening, compute distance.
- View: `bike_km_monthly` (staff, year, month, total_km).

**UI:**
- Sales dashboard widget: today's morning, current/evening input, computed distance, month total.
- Admin staff detail: monthly KM chart.

---

## Phase D — Notifications fix

- Verify `notifications` realtime publication enabled; add `ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;` if missing.
- Add DB triggers for: lead assignment, project assignment, status change, task assign, password reset → insert notification rows.
- Web push: ensure `push-sw.js` registered on login; call `send-push` edge function from a DB webhook OR from a new trigger-invoked function on `notifications` insert.
- Fix badge live update (already uses channel — verify filter syntax).
- Add unread/read toggle + "mark one read" on click.

---

## Phase E — Operator workflow + Email login + Admin password vault

**Operator:**
- Allow operator to create quotations (RLS already permits) — surface "Generate Quotation" button on `OperatorProjectDetail`.
- Allow operator to reassign sales/telecaller/welder/electrician on project (new RLS update policy for operator on assignment columns only via SECURITY DEFINER RPC `operator_reassign_project`).
- Log every reassignment into `project_assignments` (already exists).

**Email login:**
- Already email/password. Add "Forgot password" link on Login → `resetPasswordForEmail` → new `/reset-password` page.
- Staff create form: collect email (required), generate secure password, store hash in `auth.users` (via existing `create-staff` edge fn) AND store **encrypted plaintext** in new `staff_credentials` table (admin-only RLS, pgsodium or simple `vault.secrets` reference).
  - Simpler: column `temp_password text` on `staff` with RLS only `has_role(admin)`. Cleared on first successful password change.
- Password reset history → already have `password_reset_logs`. Expose in staff detail.

**Admin password visibility:**
- `StaffDetail` admin tab → masked field with "Reveal" button; logs an audit entry on reveal.

---

## Phase F — Material Dispatch + Stage Locks + UI polish

**Material dispatch:**
- New table `material_dispatches` (`project_id, items jsonb, image_url, dispatched_by, dispatched_at, notes`).
- `items` = array `{name, qty, unit}` with quick-add chips: Panels/Inverter/Structure/Wire/Earthing/Accessories.
- Storage bucket `material-dispatch` (private, admin/operator + assigned sales read).
- New page `MaterialDispatch.tsx` linked from project detail.

**Stage locks:**
- Add `project_stage_requirements` mapping: stage → required artifact (`documents`, `quotation`, `material_dispatch`, `home_location`, `serial_numbers`).
- DB function `can_advance_project(project_id, target_status) returns boolean` enforced in status-transition trigger.
- UI checklist on project header: ✅/🔒 per requirement with deep-links.

**UI polish:**
- Standardize: `Card`, status badges, button sizes, spacing scale, mobile bottom-padding.
- Sweep tables → responsive (cards on `<sm`).

---

## Suggested execution order
1. **Phase D (Notifications)** — quick win, unblocks visibility.
2. **Phase A (Attendance OT)**.
3. **Phase C (Bike KM)**.
4. **Phase B (Staff tabs + detail)**.
5. **Phase E (Operator + email + password vault)**.
6. **Phase F (Material + locks + UI sweep)**.

---

## Confirm
Reply with:
- **"Go"** → I start Phase D and proceed sequentially.
- **"Start with X"** → jump to a specific phase.
- Any tweaks (e.g. don't store plaintext passwords — recommended for security; I'll use a one-time reveal token instead if you prefer).

> ⚠️ Security note: Storing plaintext passwords (even admin-only) is risky. Industry-safer pattern = admin can **trigger a one-click reset** that sets a new temp password and shows it once. I recommend that over a permanent vault. Let me know.
