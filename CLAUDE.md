# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Mayukh Solar CRM — a role-based CRM and operations portal for a solar installation business (leads → site visits → quotations → installation projects → payments), plus staff attendance, salary and task management. React + Vite SPA on Supabase (Postgres + Auth + Storage + Edge Functions), also packaged as a PWA and a Capacitor iOS/Android shell. Originally scaffolded by Lovable.

Long-form domain docs live at the repo root and are worth reading before non-trivial work:
- `BRD.md` — business requirements, roles, module-by-module behaviour.
- `ARCHITECTURE.md` — database schema, table relationships, workflows.
- `DESIGN-SYSTEM.md` — the normative UI spec (tokens, spacing, type, states, forms, tables, toasts). **Read before changing anything visual.**
- `appuiux.md` — historical record of the UI/UX pass that produced those values; explains the rationale, but is not the spec.
- `SETUP_NEW_SUPABASE.md` — how the current Supabase project was provisioned.

## Creating or overwriting files

Two rules, both learned the hard way — a `DESIGN.md` created here silently destroyed the existing `design.md`, because macOS's filesystem is case-insensitive and they are the same file.

1. **Check for an existing file case-insensitively before creating any new one.** `ls | grep -i '^name'`, not `ls name`. On this repo's default macOS filesystem `README.md` and `readme.md` are one file; a Write to either overwrites the other with no warning and no error.
2. **Never write over a file that `git status` reports as modified**, and never assume a "modified" entry is your own doing. Read the diff first. An unexpected `M` next to a file you did not intend to touch means something already went wrong.

## Commands

```bash
npm run dev          # Vite dev server, port 8080 (or $PORT)
npm run build        # production build
npm run typecheck    # tsc --noEmit — CI-blocking, see note below
npm run lint         # eslint (non-blocking in CI)
npm test             # vitest run
npm run test:watch
```

Single test file / single test:

```bash
npx vitest run src/test/subsidy.test.ts -t "name of the test"
```

CI (`.github/workflows/ci.yml`) runs typecheck → lint → test → build. **Typecheck is the gate that matters**: `vite build` uses esbuild, which strips types without checking them, so an undefined identifier compiles fine and blows up at runtime in production. Lint is `continue-on-error` because of a ~460-error backlog of pre-existing `no-explicit-any`; don't treat existing lint noise as your bug, but don't add to it either.

Preview the app through the `dev` config in `.claude/launch.json` rather than running a server via Bash.

## Supabase

- Client: `src/integrations/supabase/client.ts`, configured from `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`. The publishable (anon) key is committed on purpose — it ships in the bundle and is constrained by RLS. The service_role key must never appear in `.env` or client code; privileged work belongs in an Edge Function.
- Types: `src/integrations/supabase/types.ts` is generated from the live schema. Do not hand-edit. When a table or RPC postdates the last generation, existing code works around it with `(supabase as any)` / `supabase.rpc('name' as any)` — follow that pattern, or regenerate types.
- Migrations: `supabase/migrations/*.sql`, applied in filename order. There is no local Docker stack here, so migrations are validated against the remote project.
- Edge Functions (`supabase/functions/`, Deno): `create-staff`, `update-staff`, `update-staff-email` (service_role admin ops, each re-verifies the caller is an admin), `generate-quotation`, `send-push` (web-push/VAPID), `whatsapp-webhook` (parses CONFIRM/REJECT replies), `consumer-lookup` (DISCOM K-Number proxy; the only function with `verify_jwt = false`).
- Storage buckets in use: `project-documents`, `attendance-media`, `material-dispatch` — all private.
- A lot of business logic lives in Postgres functions, not TypeScript: `complete_site_visit`, `mark_trade_work_done`, `project_stage_requirements`, `punch_attendance`, `compute_salary`, `bulk_assign_leads`, `leads_stage_counts`, `generate_project_code`, `get_user_role`. Before implementing a rule client-side, check whether an RPC already owns it.

## Architecture

### Auth and access control (two layers)

`src/contexts/AuthContext.tsx` resolves, per session: the Supabase user, the role (via `get_user_role`), the `staff` row, and the set of allowed feature modules. `ProtectedRoute` (`src/components/auth/ProtectedRoute.tsx`) wraps every real route and also supplies `AppLayout`.

1. **Role gate** — `<ProtectedRoute allowedRoles={['admin']}>`, for management routes.
2. **Module gate** — `<ProtectedRoute module="crm">`, driven by the `role_permissions` table and configurable at runtime in the Roles & Access UI.

`src/lib/modules.ts` defines the six gateable modules (`crm`, `site_visits`, `projects`, `tasks`, `attendance`, `contacts`) and the in-code `DEFAULT_ROLE_MODULES` fallback used when `role_permissions` is empty. Dashboard, profile and settings are deliberately *not* modules — they are never gated. Admin bypasses both layers.

Roles: `admin`, `telecaller`, `sales_person`, `operator`, `welder`, `electrician`. New signups land inactive with no role and see a "Pending Approval" screen until an admin activates them.

The auth state listener is subtle: it fires on `TOKEN_REFRESHED` and window focus too, so it only tears down the cached profile when the *user id actually changes*. Clearing it unconditionally used to flash "Pending Approval" and unmount pages mid-interaction. Preserve that behaviour when touching `AuthContext`.

### Single-source-of-truth modules

Several `src/lib` files exist specifically because the same concept used to be redefined per page, with drift. Extend these rather than adding a local map:

- `statusMeta.ts` — every domain status's label + tone, and the tone→class map. Unknown values fall back to neutral instead of borrowing another status's colour.
- `projectStages.ts` — the 12-stage project pipeline, with owner role, cash/loan applicability, and entry requirements. Wiring/dispatch/inspection are deliberately sub-steps of Installation, not stages.
- `documents.ts` — `DOCUMENT_SPECS`: every document type, its group, whether it's required, whether it's text rather than a file, and who uploads it.
- `visits.ts` — visit lifecycle, outcomes, and the outcome→lead-status mapping. Rows with `visit_status = 'note'` are legacy call logs and must never appear as visits.
- `modules.ts`, `subsidy.ts`, `payments.ts`, `projectStages.ts` are the files with unit tests; keep them pure and testable.

### List views

List pages use `useServerTable` (`src/hooks/useServerTable.ts`) plus the helpers in `src/lib/tableQuery.ts` (`buildSearchFilter`, `applyPaging`, `toTablePage`). Everything — search, filter, sort, paging — runs in Postgres; the client fetches one page. Do not reintroduce fetch-all-then-filter-in-JS. `toTablePage` throws on error deliberately, so react-query surfaces failures instead of rendering an empty table.

Sort and page size persist to localStorage via `useStickyState`; page index and search do not. The leads list reads the `leads_list` view and gets its stage tallies from one `leads_stage_counts` RPC.

### UI conventions

**Read [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) before touching any UI file.** It is the normative spec for color tokens, spacing, type scale, radius, elevation, breakpoints, component states, and the rules for forms, tables and toasts. `appuiux.md` is historical background only. It also lists known violations — don't copy the patterns it flags.

shadcn/ui (Radix) + Tailwind, path alias `@/` → `src/`. Change design at the token or primitive level — `src/index.css` custom properties and `tailwind.config.ts` — not per page. Shared shells in `src/components/common/` (`PageHeader`, `PageContainer`, `SectionCard`, `DetailShell`, `FormShell`, `DataTable`, `StatusBadge`, `EmptyState`, `ErrorState`) give every screen the same rhythm; reach for those before hand-rolling layout. One accent colour (solar orange) marks primary actions. Field staff are on phones: tables collapse to cards, 44px tap targets.

### Identity conventions

A project is identified to users by **K-Number, then customer name, then mobile** — never by `project_code` or row id. Search and display follow that order.

## Feature inventory

Every route, its gate, and the files behind it. Gate is either a role list (`allowedRoles`) or a module key (`module=`), both enforced by `ProtectedRoute`. Behaviour detail lives in `BRD.md`; this table is the map from feature → code.

### Entry, auth, shell

| Route | Gate | Page | Notes |
|---|---|---|---|
| `/login` | public | `Login.tsx` | Email+password and Google OAuth. |
| `/set-password` | public | `SetPassword.tsx` | Forced when `staff.must_change_password`; every gate redirects here first. |
| `/install` | public | `InstallApp.tsx` | PWA install instructions. |
| `/` | signed in | `Index.tsx` | Role router only — dispatches to the six dashboards below, renders "Pending Approval" for inactive/roleless users. |
| `*` | — | `NotFound.tsx` | |

Dashboards: `AdminDashboard`, `TelecallerDashboard`, `SalesPersonDashboard`, `OperatorDashboard`, and `WelderDashboard`/`ElectricianDashboard` — the last two are 9-line wrappers over the shared `pages/trades/TradeDashboard.tsx`; the electrician variant additionally captures panel and inverter serials.

Chrome: `AppLayout` + `AppSidebar`. The admin sidebar is a hardcoded six-section list; **non-admin navigation is derived from `hasModule()`**, so it always mirrors Roles & Access, and empty sections are dropped. Add a nav entry in `buildNav`, not per page.

### CRM — leads

| Route | Gate | Page |
|---|---|---|
| `/leads` | `module=crm` | `AdminLeadsList.tsx` (~1200 lines) |
| `/leads/new` | `module=crm` | `CreateLead.tsx` |
| `/leads/:id` | `module=crm` | `LeadDetail.tsx` (~2600 lines) |
| `/leads/bin` | `admin` | `CancelledLeadsBin.tsx` |
| `/deals` | `module=crm` | `DealsDashboard.tsx` |
| `/field-visit` | `module=crm` | `FieldVisit.tsx` |
| `/k-lookup` | admin, telecaller, sales_person, operator | `KNumberLookup.tsx` |

- The leads list reads the **`leads_list` view**, not the `leads` table, and gets stage tallies from a single `leads_stage_counts` RPC. Filtering, sorting and paging all run in Postgres. It also does bulk assign (`bulk_assign_leads`), bulk bin (`bulk_bin_leads`), per-row DISCOM sync, and realtime subscription. The same page serves non-admins as "My Leads" — RLS scopes the rows, the UI is not forked.
- `AdminLeadsList` hand-rolls its table rather than using `DataTable`, so it carries **two renderings of the same rows**: the seven-column `<table>` (`hidden md:block`, inside the sticky-header scroller) and a stacked card list (`md:hidden`) that mirrors `DataTable`'s mobile cards — the pattern the Site Visits list gets for free. Both read `filteredRows` and share the same handlers (select, DISCOM sync, edit K-Number, call, bin, navigate). Any column change has to be made in both, or the phone view silently drifts from the desktop one.
- `CreateLead` checks `check_duplicate_lead` on mobile and loads assignees via `get_assignable_sales_persons`.
- `LeadDetail` has three tabs (Details, Documents, Plant) and hosts the lead-side panels in `components/leads/`: `LeadDocumentsPanel`, `LeadVisitsPanel`, `LeadQuotationsPanel`, `CreateQuotationDialog`, `QuotationPreviewDialog`, `CompleteVisitDialog`, `LeadImportWizard` (CSV/Excel quotation import via `xlsx`).
- Lead statuses: the 11 values mapped in `statusMeta.ts`. Quotation logic is in `lib/leadQuotations.ts`; PDF rendering in `lib/quotationPdf.ts` (`html2pdf.js`) driven by the `generate-quotation` edge function.
- `KNumberLookup` / `lib/discom.ts` hit the `consumer-lookup` edge function (dev proxies `/api/discom` to `cescrajasthan.co.in`).

### Site visits

| Route | Gate | Page |
|---|---|---|
| `/visits` | `module=site_visits` | `visits/VisitsListPage.tsx` |
| `/visits/:visitId` | `module=site_visits` | `visits/VisitDetailPage.tsx` |

`lib/visits.ts` owns the lifecycle: booked → completed/cancelled, five outcomes, and `OUTCOME_TO_LEAD_STATUS` which moves the parent lead on completion (via the `complete_site_visit` RPC). `VISIT_DOCUMENTS` are collected on site and attach to the **lead**, not a project — the project doesn't exist yet. Rows with `visit_status = 'note'` are legacy call logs and must never render as visits.

### Projects

| Route | Gate | Page |
|---|---|---|
| `/projects` | `module=projects` | `projects/ProjectsListPage.tsx` |
| `/projects/:projectId` | `module=projects` | `projects/ProjectDetailPage.tsx` — tabs: Customer, Plant, Documents |
| `/projects/new`, `/projects/:projectId/edit` | admin, sales_person | `ProjectFinalizationForm.tsx` |
| `/projects/:projectId/documents` | `module=projects` | `ProjectDocuments.tsx` |
| `/projects/:projectId/material-dispatch` | `module=projects` | `MaterialDispatch.tsx` |
| `/projects/:projectId/home-location` | `module=projects` | `ProjectHomeLocation.tsx` |
| `/operator/projects/:projectId` | `module=projects` | `OperatorProjectDetail.tsx` |
| `/admin/projects` | `admin` | `AdminProjects.tsx` — **legacy**, superseded by `/projects` but still linked in the admin sidebar |

- Pipeline: the 12 stages in `lib/projectStages.ts`, each with an owner role, cash/loan applicability and an entry requirement. Advancement is gated server-side by `can_advance_project` / `project_stage_requirements`.
- Payments (`lib/payments.ts`): cash is 30% advance → 60% post-installation → 10% commissioning; loan is customer margin → bank first → bank final. **Fabrication on a loan file is blocked until `loan_bank_first` is received** — enforced in `can_advance_project` and mirrored in the UI.
- Trade work (`lib/projectWork.ts`) completes through `mark_trade_work_done` with photo proof.
- Subsidy (`lib/subsidy.ts`): PM Surya Ghar is **slab-based by capacity, not flat** — ₹30k/₹60k/₹78k. Admins override slabs in `system_configs`; the hardcoded slabs are only a fallback so a failed fetch never renders ₹0.
- Supporting components in `components/projects/`: `StageChecklist`, `ProjectTimeline`, `ManagePaymentsDialog`, `MarkWorkDoneDialog`, `DocumentPoolDialog`, `QuotationButton`.
- `ProjectFinalizationForm` mints the code via `generate_project_code` — but remember projects are *identified to users* by K-Number → name → mobile.

### Attendance, tasks, people, finance

| Route | Gate | Page |
|---|---|---|
| `/attendance` | `module=attendance` | `Attendance.tsx` — geofenced punch in/out, photo capture, `request_special_punch_out` |
| `/my-attendance` | `module=attendance` | `MyAttendance.tsx` |
| `/admin/attendance` | `admin` | `AdminAttendance.tsx` — `review_punch_out_request` |
| `/tasks` | `module=tasks` | `Tasks.tsx` |
| `/contacts` | `module=contacts` | `StaffContacts.tsx` — `get_staff_directory` |
| `/users`, `/users/new`, `/users/:id`, `/users/:id/edit`, `/users/reset-logs` | `admin` | `users/UserManagementPage.tsx` (tabs: Users, Roles & Access), `AddStaff.tsx`, `staff/StaffDetailPage.tsx`, `staff/StaffFormPage.tsx`, `PasswordResetLogs.tsx` |
| `/admin/performance` | `admin` | `StaffPerformance.tsx` |
| `/admin/salary` | `admin` | `SalaryManagement.tsx` — tabs: Payroll, Profiles, Advances; `compute_salary`, `mark_salary_paid` |
| `/profile` | any role | `StaffProfile.tsx` |
| `/settings` | any role | `SettingsPage.tsx` |
| `/admin/settings` | `admin` | `AdminSettings.tsx` — tabs: Geofences, T&C Templates, Vendor Profile, Bank Accounts, Plant Dropdowns, WhatsApp Config |
| `/activity-logs` | `admin` | `ActivityLogs.tsx` |

- **User Management is the unified module.** Every signup appears there; the admin assigns a role (which activates the account) and configures per-role module access under Roles & Access (`users/RoleAccessPanel.tsx`, `users/UsersPanel.tsx`). The old `/staff/*` URLs all 301 to `/users/*` via redirects in `App.tsx` — `StaffRedirect` preserves the `:id`.
- Staff creation/editing goes through the `create-staff` / `update-staff` / `update-staff-email` edge functions because they need service_role; each re-verifies the caller is an admin. Password resets issue a **6-digit numeric PIN**, deliberately readable over the phone.
- Attendance capture helpers live in `lib/capture.ts` (geolocation + `browser-image-compression`); media goes to the `attendance-media` bucket.

### Cross-cutting

- **WhatsApp** (`lib/whatsapp.ts`): provider config is read from the `whatsapp_config` row in `system_configs` at send time (UltraMsg and others), editable in Admin Settings. Inbound CONFIRM/REJECT replies are parsed by the `whatsapp-webhook` function, which recognises English and Hindi keywords and extracts quotation numbers like `MS-Q-123456-01`.
- **Push** (`lib/push.ts` + `send-push`): web-push/VAPID, `public/push-sw.js`, surfaced in `components/notifications/NotificationPanel.tsx` (realtime).
- **Export**: `lib/exportCsv.ts`; bulk document download zips via `jszip`.
- **Config**: `lib/systemConfig.ts` reads typed rows from `system_configs` — the general escape hatch for admin-editable settings.

## Notes

- `vite.config.ts` emits an `app-version.json` and defines `__APP_VERSION__` from build time, used for update detection; the dev server proxies `/api/discom` to the Rajasthan DISCOM site.
- Service workers: `public/sw.js`, `public/service-worker.js`, `public/push-sw.js` — plus `vite-plugin-pwa` in deps. Be careful about caching when debugging "my change didn't appear".
- Deployment is Vercel with a catch-all rewrite to `index.html` (`vercel.json`).
- The Supabase MCP server (`.mcp.json`) points at project `fjpjgsfcnicslwhrjqgl` and requires authorization before its tools work.
