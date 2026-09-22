import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { TablePage, TableQueryParams } from '@/hooks/useServerTable';

/**
 * Reads for the Performance module.
 *
 * The four functions behind this file (20260918001000) postdate the generated
 * types, so the casts live here rather than at every call site — the same
 * pattern `systemConfig.ts` and `calls.ts` use.
 *
 * Nothing in this file computes a metric. Every figure comes from the database,
 * because the drill-down has to return exactly the rows a tile counted, and two
 * implementations of "overdue" is how that stops being true.
 */

const db = supabase as unknown as SupabaseClient;

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{
  data: unknown;
  error: { message: string } | null;
}>;
const rpc: Rpc = (fn, args) => (db.rpc as unknown as Rpc).call(db, fn, args);

/** One employee's figures for a period. Mirrors `performance_overview`. */
export interface PerformanceRow {
  user_id: string;
  full_name: string;
  role: string;

  work_assigned: number;
  work_completed: number;
  work_pending: number;
  work_overdue: number;
  work_cancelled: number;
  work_on_time: number;
  work_on_time_eligible: number;
  work_completed_in_period: number;

  tasks_assigned: number;
  tasks_completed: number;
  tasks_pending: number;
  tasks_overdue: number;
  tasks_on_time: number;
  tasks_on_time_eligible: number;

  calls_assigned: number;
  calls_dialed: number;
  calls_connected: number;
  calls_not_connected: number;
  calls_unlogged: number;
  calls_not_attempted: number;
  follow_ups_scheduled: number;
  follow_ups_due: number;
  follow_ups_completed: number;
  follow_ups_overdue: number;
  leads_interested: number;
  leads_not_interested: number;
  visits_booked: number;

  leads_assigned: number;
  leads_contacted: number;
  leads_qualified: number;
  visits_completed: number;
  quotations_sent: number;
  deals_won: number;
  deals_lost: number;
  revenue: number;
  pipeline_value: number;

  projects_assigned: number;
  surveys_assigned: number;
  surveys_completed: number;
  documents_pending: number;
  applications_submitted: number;
  approvals_completed: number;
  installations_scheduled: number;
  installations_completed: number;
  projects_completed: number;
  projects_delayed: number;

  target_metric: string;
  /** Null — not zero — when nobody has set one. */
  target_value: number | null;
  achievement: number;
}

/** One row of the assigned-work table, and of every drill-down. */
export interface WorkItem {
  kind: 'task' | 'visit' | 'lead' | 'project';
  item_id: string;
  owner_id: string;
  owner_name: string;
  title: string;
  /** The lead, customer or project this work is about. */
  subject: string;
  priority: string | null;
  /** Already folded: an open item past its due date arrives as `overdue`. */
  status: string;
  assigned_at: string;
  due_date: string | null;
  completed_at: string | null;
  outcome: string | null;
  lead_id: string | null;
  project_id: string | null;
}

export interface TrendPoint {
  bucket: string;
  assigned: number;
  completed: number;
  revenue: number;
}

/** The slice of work a tile represents. Passed straight through to the drill-down. */
export type WorkBucket =
  | 'assigned'
  | 'completed'
  | 'pending'
  | 'overdue'
  | 'due_today'
  | 'completed_in_period'
  | 'cancelled'
  | 'all';

export interface PerformanceFilters {
  from: string;
  to: string;
  role?: string | null;
  staff?: string | null;
}

const numeric = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Postgres hands `bigint` and `numeric` back as strings; normalise once, here. */
const normaliseRow = (raw: Record<string, unknown>): PerformanceRow => {
  const out: Record<string, unknown> = { ...raw };
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'user_id' || key === 'full_name' || key === 'role' || key === 'target_metric') continue;
    // A missing target must stay null: "no target set" and "a target of zero"
    // are different answers and the tile says so.
    out[key] = key === 'target_value' && (value === null || value === undefined) ? null : numeric(value);
  }
  return out as unknown as PerformanceRow;
};

export const fetchPerformanceOverview = async (
  filters: PerformanceFilters
): Promise<PerformanceRow[]> => {
  const { data, error } = await rpc('performance_overview', {
    _from: filters.from,
    _to: filters.to,
    _role: filters.role || null,
    _staff: filters.staff || null,
  });
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map(normaliseRow);
};

export const fetchPerformanceTrend = async (
  filters: PerformanceFilters & { grain: 'day' | 'month' }
): Promise<TrendPoint[]> => {
  const { data, error } = await rpc('performance_trend', {
    _from: filters.from,
    _to: filters.to,
    _grain: filters.grain,
    _staff: filters.staff || null,
    _role: filters.role || null,
  });
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    bucket: String(r.bucket),
    assigned: numeric(r.assigned),
    completed: numeric(r.completed),
    revenue: numeric(r.revenue),
  }));
};

export interface WorkItemQuery extends PerformanceFilters {
  bucket: WorkBucket;
  kind?: string | null;
  status?: string | null;
  priority?: string | null;
  search?: string;
  sort?: string;
  direction?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export const fetchWorkItems = async (query: WorkItemQuery): Promise<TablePage<WorkItem>> => {
  const { data, error } = await rpc('performance_work_items', {
    _from: query.from,
    _to: query.to,
    _staff: query.staff || null,
    _role: query.role || null,
    _bucket: query.bucket,
    _kind: query.kind || null,
    _status: query.status || null,
    _priority: query.priority || null,
    _search: query.search || null,
    _sort: query.sort || 'due_date',
    _dir: query.direction || 'asc',
    _limit: query.limit ?? 25,
    _offset: query.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  const payload = (data ?? {}) as { total?: number; rows?: WorkItem[] };
  return { rows: payload.rows ?? [], total: numeric(payload.total) };
};

/** `useServerTable`'s `fetchPage`, wired to the same function the tiles count with. */
export const workItemsPageFetcher =
  (base: PerformanceFilters & { bucket: WorkBucket }) =>
  (params: TableQueryParams): Promise<TablePage<WorkItem>> =>
    fetchWorkItems({
      ...base,
      kind: (params.filters.kind as string) || null,
      status: (params.filters.status as string) || null,
      priority: (params.filters.priority as string) || null,
      search: params.search,
      sort: params.sort.column,
      direction: params.sort.direction,
      limit: params.to - params.from + 1,
      offset: params.from,
    });

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

export interface PerformanceTarget {
  id: string;
  staff_user_id: string;
  period_month: string;
  metric: string;
  target_value: number;
}

/** Targets for the months a period touches. Admin-write, self-read, at the RLS layer. */
export const fetchTargets = async (from: string, to: string): Promise<PerformanceTarget[]> => {
  const firstOfMonth = `${from.slice(0, 7)}-01`;
  const { data, error } = await db
    .from('performance_targets')
    .select('id, staff_user_id, period_month, metric, target_value')
    .gte('period_month', firstOfMonth)
    .lte('period_month', `${to.slice(0, 7)}-01`);
  if (error) throw new Error(error.message);
  return ((data as PerformanceTarget[]) ?? []).map((t) => ({ ...t, target_value: numeric(t.target_value) }));
};

export const saveTarget = async (input: {
  staffUserId: string;
  month: string;
  metric: string;
  value: number;
}): Promise<void> => {
  const { error } = await db.from('performance_targets').upsert(
    {
      staff_user_id: input.staffUserId,
      period_month: `${input.month.slice(0, 7)}-01`,
      metric: input.metric,
      target_value: input.value,
    },
    { onConflict: 'staff_user_id,period_month,metric' }
  );
  if (error) throw new Error(error.message);
};
