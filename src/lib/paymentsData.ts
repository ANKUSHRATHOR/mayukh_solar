import { supabase } from '@/integrations/supabase/client';
import { applyPaging, buildSearchFilter, toTablePage } from '@/lib/tableQuery';
import type { TableQueryParams, TablePage } from '@/hooks/useServerTable';
import type { Allocation } from '@/lib/payments';
import type { Database, Json } from '@/integrations/supabase/types';

/**
 * Data access for inward payments.
 *
 * Everything reads the `payments_list` and `project_dues` views rather than
 * `project_payments` directly: the list searches on the customer's K-Number,
 * name and mobile, which live two joins away, and PostgREST cannot `or()`
 * across an embedded resource. Both views are `security_invoker`, so RLS still
 * decides which rows a caller sees.
 *
 * types.ts was regenerated after the payments migration, so `payments_list`,
 * `project_dues`, `payments_kpis` and `payment_due_days` are all typed — no
 * `as any` escape hatches are needed here.
 */

/** The shape `toTablePage` needs, once a paged query has been awaited. */
type QueryResult<T> = { data: T[] | null; error: { message: string } | null; count: number | null };

export type PaymentStatus = 'pending' | 'completed' | 'rejected';
export type PaymentMode = 'cash' | 'bank_transfer' | 'cheque' | 'upi' | 'other';

export const PAYMENT_MODES: PaymentMode[] = [
  'cash',
  'bank_transfer',
  'cheque',
  'upi',
  'other',
];

export interface PaymentRow {
  id: string;
  project_id: string | null;
  source: 'customer' | 'bank';
  amount: number;
  payment_date: string;
  payment_mode: PaymentMode;
  reference_number: string | null;
  status: PaymentStatus;
  milestone: string | null;
  notes: string | null;
  payer_name: string | null;
  no_project_needed: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  allocation: Allocation;
  /** Null on every unlinked row — the join has nothing to reach. */
  project_code: string | null;
  final_amount: number | null;
  payment_type: 'cash' | 'loan' | null;
  project_status: string | null;
  assigned_sales_person_id: string | null;
  k_number: string | null;
  customer_name: string | null;
  mobile: string | null;
}

export interface DueRow {
  project_id: string;
  project_code: string | null;
  project_status: string;
  payment_type: 'cash' | 'loan';
  assigned_sales_person_id: string | null;
  k_number: string | null;
  customer_name: string | null;
  mobile: string | null;
  final_amount: number;
  received: number;
  balance: number;
  net_meter_installed_at: string;
  days_since_net_meter: number;
  days_overdue: number;
  is_overdue: boolean;
}

/** The four buckets the payments list offers. `dues` is a different view. */
export type PaymentTab = 'all' | 'unallocated' | 'dues' | 'general';

export const isPaymentTab = (value: string | null): value is PaymentTab =>
  value === 'all' || value === 'unallocated' || value === 'dues' || value === 'general';

const SEARCH_COLUMNS = [
  'k_number',
  'customer_name',
  'mobile',
  'reference_number',
  'payer_name',
];

export interface PaymentFilters {
  tab?: PaymentTab;
  mode?: PaymentMode;
  status?: PaymentStatus;
}

/** One page of payments. */
export const fetchPaymentsPage = async (
  params: TableQueryParams
): Promise<TablePage<PaymentRow>> => {
  const { tab, mode, status } = params.filters as PaymentFilters;

  let query = supabase.from('payments_list').select('*', { count: 'exact' });

  if (tab === 'unallocated') {
    query = query.is('project_id', null).eq('no_project_needed', false);
  } else if (tab === 'general') {
    query = query.eq('no_project_needed', true);
  }

  // Both are validated by the caller before they reach here — an unvalidated
  // ?mode=foo becomes .eq('payment_mode','foo') and PostgREST 400s on the
  // check constraint's domain.
  if (mode) query = query.eq('payment_mode', mode);
  if (status) query = query.eq('status', status);

  const filter = buildSearchFilter(params.search, SEARCH_COLUMNS);
  if (filter) query = query.or(filter);

  const result = (await applyPaging(query, params)) as QueryResult<PaymentRow>;
  return toTablePage<PaymentRow>(result);
};

/** One page of projects that still owe money. */
export const fetchDuesPage = async (
  params: TableQueryParams
): Promise<TablePage<DueRow>> => {
  let query = supabase.from('project_dues').select('*', { count: 'exact' });

  const filter = buildSearchFilter(params.search, ['k_number', 'customer_name', 'mobile']);
  if (filter) query = query.or(filter);

  const result = (await applyPaging(query, params)) as QueryResult<DueRow>;
  return toTablePage<DueRow>(result);
};

export interface PaymentKpis {
  received_this_month: number;
  outstanding: number;
  overdue_amount: number;
  overdue_count: number;
  unallocated_count: number;
  unallocated_amount: number;
  due_days: number;
}

/** Every tile in one round trip — see the note in the migration. */
export const fetchPaymentKpis = async (): Promise<PaymentKpis> => {
  const { data, error } = await supabase.rpc('payments_kpis');
  if (error) throw new Error(error.message);
  // The RPC is typed as returning Json; payments_kpis builds this object.
  return data as unknown as PaymentKpis;
};

/**
 * One payment, joined to its project. Drives the payment detail page.
 *
 * Reads the view rather than the table so the page can show the customer's
 * K-Number and name without a second round trip.
 */
export const fetchPayment = async (id: string): Promise<PaymentRow | null> => {
  const { data, error } = await supabase
    .from('payments_list')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as PaymentRow | null) ?? null;
};

/**
 * Display names for the staff who created and last edited a payment.
 *
 * Returns an empty map rather than throwing: authorship is a nicety on the
 * detail page, and a staff table a role cannot read must not take the page down.
 */
export const fetchStaffNames = async (
  userIds: (string | null)[]
): Promise<Record<string, string>> => {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from('staff')
    .select('user_id, full_name')
    .in('user_id', ids);

  if (error) return {};
  return Object.fromEntries(
    (data ?? [])
      .filter((s) => s.user_id)
      .map((s) => [s.user_id as string, s.full_name])
  );
};

/** Payments on one project, newest first. Drives the project's Payments tab. */
export const fetchProjectPayments = async (projectId: string): Promise<PaymentRow[]> => {
  const { data, error } = await supabase
    .from('payments_list')
    .select('*')
    .eq('project_id', projectId)
    .order('payment_date', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as PaymentRow[];
};

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * A row of `project_payments` itself, which is what a write returns — narrower
 * than PaymentRow, which is the joined `payments_list` view and carries the
 * customer identity a bare insert cannot know.
 */
export type PaymentRecord = Database['public']['Tables']['project_payments']['Row'];

export interface PaymentInput {
  project_id: string | null;
  no_project_needed: boolean;
  amount: number;
  payment_date: string;
  payment_mode: PaymentMode;
  source: 'customer' | 'bank';
  reference_number: string | null;
  payer_name: string | null;
  notes: string | null;
  status: PaymentStatus;
}

/**
 * Records what happened to a payment.
 *
 * Payments are the one place in this app where a typo costs real money to
 * reconcile, so every write leaves a row behind. Failures are swallowed: an
 * audit row that cannot be written must not roll back a payment that already
 * landed.
 */
const audit = async (
  action: string,
  paymentId: string,
  oldValue: Json,
  newValue: Json
) => {
  try {
    const { data: session } = await supabase.auth.getUser();
    await supabase.from('audit_logs').insert({
      user_id: session.user?.id ?? null,
      action,
      entity_type: 'payment',
      entity_id: paymentId,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
    });
  } catch {
    /* audit is best-effort */
  }
};

export const createPayment = async (input: PaymentInput): Promise<PaymentRecord> => {
  const { data, error } = await supabase
    .from('project_payments')
    .insert(input)
    .select()
    .single();

  if (error) throw new Error(error.message);
  await audit('payment_created', data.id, null, data as Json);
  return data;
};

export const updatePayment = async (
  id: string,
  input: Partial<PaymentInput>,
  previous?: PaymentRow
): Promise<PaymentRecord> => {
  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('project_payments')
    .update({ ...input, updated_by: user.user?.id ?? null })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  await audit('payment_updated', id, (previous ?? null) as unknown as Json, data as Json);
  return data;
};

export const deletePayment = async (id: string, previous?: PaymentRow): Promise<void> => {
  const { error } = await supabase.from('project_payments').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await audit('payment_deleted', id, (previous ?? null) as unknown as Json, null);
};

// Linking an unallocated payment is just an edit that fills in the project, so
// it goes through PaymentFormDialog and updatePayment rather than a separate
// call of its own.

// ---------------------------------------------------------------------------
// Project picker
// ---------------------------------------------------------------------------

/** What the picker query returns before it is flattened into a ProjectOption. */
interface ProjectQueryRow {
  id: string;
  k_number: string | null;
  final_amount: number | null;
  payment_type: 'cash' | 'loan';
  consumer_name: string | null;
  leads: { customer_name: string; mobile: string | null; k_number: string | null } | null;
}

export interface ProjectOption {
  id: string;
  k_number: string | null;
  customer_name: string;
  mobile: string | null;
  final_amount: number;
  payment_type: 'cash' | 'loan';
}

/**
 * Projects matching a term, for the payment form's picker.
 *
 * Search order is the house identity convention — K-Number, then customer name,
 * then mobile — and the results are labelled the same way.
 */
export const searchProjectsForPayment = async (term: string): Promise<ProjectOption[]> => {
  const safe = term.trim().replace(/[,()*]/g, ' ').trim();

  let query = supabase
    .from('projects')
    .select(
      'id, k_number, final_amount, payment_type, consumer_name, leads!inner(customer_name, mobile, k_number)'
    )
    .order('created_at', { ascending: false })
    .limit(20);

  if (safe) {
    // Two steps for the same reason fetchProjectsPage needs them: PostgREST
    // cannot or() across an embedded resource in a single expression.
    const { data: leadMatches } = await supabase
      .from('leads')
      .select('id')
      .or(
        [
          `customer_name.ilike.%${safe}%`,
          `mobile.ilike.%${safe}%`,
          `k_number.ilike.%${safe}%`,
        ].join(',')
      )
      .limit(200);

    const leadIds = (leadMatches ?? []).map((l) => l.id);
    const clauses = [`k_number.ilike.%${safe}%`];
    if (leadIds.length > 0) clauses.push(`lead_id.in.(${leadIds.join(',')})`);
    query = query.or(clauses.join(','));
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as ProjectQueryRow[]).map((p) => ({
    id: p.id,
    k_number: p.k_number ?? p.leads?.k_number ?? null,
    customer_name: p.leads?.customer_name ?? p.consumer_name ?? 'Unnamed customer',
    mobile: p.leads?.mobile ?? null,
    final_amount: Number(p.final_amount ?? 0),
    payment_type: p.payment_type,
  }));
};

/** Single-line label for a project in the picker and on a payment row. */
export const projectOptionLabel = (option: ProjectOption): string =>
  option.k_number ?? option.customer_name ?? option.mobile ?? 'Project';
