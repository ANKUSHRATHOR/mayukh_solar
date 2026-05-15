# CRM Upgrade Plan

Large scope — breaking into 7 focused workstreams. I'll do them in the order below, verify each, then move on.

## 1. Telecaller → Sales Person Lead Assignment
- **DB (migration):** Add RLS policies so telecallers can `UPDATE` their own leads' `assigned_to_user_id` and `SELECT` staff list (read-only, name + role) for the assignment dropdown. Add a SECURITY DEFINER function `get_assignable_sales_persons()` returning `{user_id, full_name, mobile}` to avoid exposing the full staff table.
- **UI (`LeadDetail.tsx` + telecaller views):** Add "Assign / Reassign Sales Person" dropdown visible to telecallers on their own leads. Show currently assigned sales person's full details (name, mobile, email) in a card.
- **Notifications:** Existing `notify_lead_assigned` trigger already fires — reuse.

## 2. Operator Document Preview 404 Fix
- **Root cause:** `documents.file_url` likely stores the storage path, but the preview code uses it as a public URL. Bucket `project-documents` is private → public URL 404s.
- **Fix:** In `OperatorProjectDetail.tsx` and `ProjectDocuments.tsx`, replace direct URL usage with `supabase.storage.from('project-documents').createSignedUrl(path, 3600)` for both preview and download.
- **Storage RLS:** Add policy allowing operators + admins to read all objects in `project-documents`.

## 3. Auto-Refresh Loop During Downloads
- **Root cause:** `checkForPublishedUpdate` in `main.tsx` runs on `focus` and `visibilitychange`. When a download triggers a new tab/window or the browser regains focus, it re-checks version and may force `window.location.replace` if `app-version.json` differs (or fetches fail intermittently).
- **Fix:** (a) Guard against refresh while a download is in progress using a module-level flag set by download helpers. (b) Debounce the focus handler. (c) Only refresh once per session even if version mismatch reoccurs.

## 4. Bulk Document Download (ZIP)
- **Library:** Add `jszip` (small, client-side).
- **UI:** "Download all" button on operator project detail. Iterates documents, fetches signed URLs, streams blobs into ZIP, saves as `<project_code>-documents.zip`.

## 5. Quotation Duplicate Calculation Fix
- **Root cause:** Aggregations sum across all `quotations` rows; multiple quotations per project inflate totals.
- **Fix:** In `QuotationsList.tsx` (operator view), compute totals using DISTINCT-by-project (latest quotation per project_id).

## 6. Multi-Step Project Assignment Workflow
- **DB (migration):** Add RLS policies allowing each role to UPDATE the *next* assignment column on projects they're currently assigned to:
  - Operator → can set `assigned_sales_person_id`, `assigned_welder_id`, `assigned_electrician_id`
  - Sales person → can set `assigned_welder_id` after documents submitted
  - Welder → can set `assigned_electrician_id` after installation done
  - Electrician → can mark complete / hand back to operator
- **UI:** Add "Assign to next staff" dropdown on project detail visible per role with workflow stage gating.
- **Notifications:** Existing `notify_worker_assigned` trigger covers welder/electrician. Add notification insert in code for sales person handoff.

## 7. Push Notifications (Outside-App)
- Already wired (`push-sw.js`, `send-push` edge function, `dispatch_push_on_notification` trigger). Verify trigger is attached to `notifications` table — schema info says "no triggers" → **trigger is missing**.
- **Fix:** Re-create trigger `AFTER INSERT ON notifications` calling `dispatch_push_on_notification()`.
- **UI:** Add "Enable Notifications" prompt in Settings page if `Notification.permission === 'default'`.

## Cross-cutting
- Run `supabase--linter` after migrations.
- Verify no infinite re-renders by checking effect dependencies in modified files.
- Keep semantic tokens, no hardcoded colors.

## Order of execution
1. Migration #1 (telecaller RLS + assignable sales function)
2. Migration #2 (workflow assignment RLS + storage policy + push trigger)
3. Frontend changes (LeadDetail, OperatorProjectDetail, ProjectDocuments, QuotationsList, main.tsx, Settings)
4. Add jszip dependency
5. Verify
