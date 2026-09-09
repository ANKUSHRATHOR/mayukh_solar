import type { AppRole } from '@/lib/modules';

/**
 * What each role may *do*, mirroring the RLS policies that actually enforce it.
 *
 * These are not security. Row Level Security is — every one of these decisions
 * is made again in Postgres against `auth.uid()`, and the server wins. They
 * exist so the UI stops offering controls the server will refuse: a button that
 * fails on click is worse than no button, and a save that silently affects zero
 * rows is worse than both.
 *
 * Each helper names the migration it mirrors. When a policy changes, change the
 * helper in the same commit — `src/test/capabilities.test.ts` pins the whole
 * six-role matrix so drift fails CI rather than reaching a user.
 *
 * Module access answers a different question ("is this feature switched on for
 * my role?", configurable in Roles & Access) and lives in `src/lib/modules.ts`.
 * These answer "will the database let me?", which is not configurable.
 */

/** Admin is never restricted by these; it bypasses the module layer too. */
const isAdmin = (role: AppRole | null | undefined): boolean => role === 'admin';

// ---------------------------------------------------------------------------
// Payments — 20260909000000_rls_initplan_payments_and_auth.sql
//            + 20260909000100_close_project_payments_open_policies.sql
// ---------------------------------------------------------------------------

/**
 * SELECT on project_payments: admin and operator see everything, a sales person
 * sees payments on projects assigned to them. Telecaller, welder and
 * electrician match no policy and get no rows.
 */
export const canReadPayments = (role: AppRole | null | undefined): boolean =>
  isAdmin(role) || role === 'operator' || role === 'sales_person';

/** INSERT follows SELECT — the same three roles may record a receipt. */
export const canAddPayment = (role: AppRole | null | undefined): boolean =>
  canReadPayments(role);

/**
 * UPDATE and DELETE are admin-only ("Admins manage payments" is the sole policy
 * for those commands), so correcting or removing a receipt is an admin job.
 */
export const canEditPayment = (role: AppRole | null | undefined): boolean => isAdmin(role);
export const canDeletePayment = (role: AppRole | null | undefined): boolean => isAdmin(role);

// ---------------------------------------------------------------------------
// Documents — 20260611053023 (sales), 20260719000300 (field workers),
//             20260721000000 (lead documents)
// ---------------------------------------------------------------------------

/**
 * INSERT of a *project-scoped* document. Admin and sales only: the operator
 * policies grant SELECT and UPDATE but no INSERT, and the telecaller policy
 * requires `lead_id IS NOT NULL`, which a project document never has.
 *
 * Welders and electricians do insert proof photos, but through
 * `mark_trade_work_done` and MarkWorkDoneDialog, not this page.
 */
export const canUploadProjectDoc = (role: AppRole | null | undefined): boolean =>
  isAdmin(role) || role === 'sales_person';

// ---------------------------------------------------------------------------
// Leads — 20260722000000_telecaller_lead_scope.sql, 20260801000000
// ---------------------------------------------------------------------------

/** `bulk_assign_leads` raises unless the caller is admin or operator. */
export const canBulkAssignLeads = (role: AppRole | null | undefined): boolean =>
  isAdmin(role) || role === 'operator';

/** `bulk_bin_leads` and the hard delete in the bin are admin-only. */
export const canBinLeads = (role: AppRole | null | undefined): boolean => isAdmin(role);

// ---------------------------------------------------------------------------
// Projects — 20260907000100_assignable_trade_staff.sql
// ---------------------------------------------------------------------------

/**
 * Assigning a welder or electrician. Mirrors the admin-or-operator guard inside
 * `get_assignable_trade_staff`. `canAssignTrades` in lib/projectWork.ts is the
 * original of this and is already wired up correctly; re-exported here so there
 * is one place to read the whole matrix.
 */
export const canAssignTradeStaff = (role: AppRole | null | undefined): boolean =>
  isAdmin(role) || role === 'operator';
