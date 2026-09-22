/**
 * The Performance module's rules, in one place.
 *
 * Every formula the module shows is here rather than inline in a component, for
 * the reason `payments.ts` exists: the numbers have to mean the same thing in
 * the tile, the table, the chart and the CSV, and the SQL side
 * (`performance_overview`) is written against these same definitions. When a
 * rule changes it changes here and in the migration, and `performance.test.ts`
 * holds the two to each other.
 */

/**
 * The business day.
 *
 * Every period boundary in this module — and in the SQL behind it — is a whole
 * day in India. A UTC boundary would file the first five and a half hours of a
 * working day under the day before, which on a "Today" tile is the difference
 * between an empty screen and a morning's work.
 */
export const BUSINESS_TIMEZONE = 'Asia/Kolkata';

/** `yyyy-MM-dd` for an instant, read in the business timezone. */
export const businessDate = (at: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);

const parts = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return { y, m, d };
};

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Days in a month, 1-indexed month. */
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Calendar days between two ISO dates, inclusive of both ends. */
export const daysBetween = (from: string, to: string): number => {
  const a = Date.UTC(parts(from).y, parts(from).m - 1, parts(from).d);
  const b = Date.UTC(parts(to).y, parts(to).m - 1, parts(to).d);
  return Math.round((b - a) / 86_400_000) + 1;
};

/** Shifts an ISO date by whole days, staying in calendar arithmetic. */
export const addDays = (isoDate: string, delta: number): string => {
  const { y, m, d } = parts(isoDate);
  const shifted = new Date(Date.UTC(y, m - 1, d + delta));
  return iso(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
};

export type PeriodKey = 'today' | 'month' | 'year' | 'custom';

export interface PeriodRange {
  key: PeriodKey;
  from: string;
  to: string;
  label: string;
  /** Day buckets for short periods, months for long ones. */
  grain: 'day' | 'month';
  /**
   * The period immediately before this one, of the same length, for the
   * comparison line. Today↔yesterday, this month↔last month, this year↔last
   * year; a custom range compares against the same number of days before it.
   */
  previous: { from: string; to: string; label: string };
}

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Today',
  month: 'This Month',
  year: 'This Year',
  custom: 'Custom Range',
};

/**
 * Resolves a period choice into the two dates every query takes.
 *
 * `today` is the business day, not the browser's — someone opening this from a
 * laptop still set to another timezone gets the office's today.
 */
export const periodRange = (
  key: PeriodKey,
  custom?: { from: string; to: string },
  now: Date = new Date()
): PeriodRange => {
  const today = businessDate(now);
  const { y, m } = parts(today);

  switch (key) {
    case 'today':
      return {
        key,
        from: today,
        to: today,
        label: 'Today',
        grain: 'day',
        previous: { from: addDays(today, -1), to: addDays(today, -1), label: 'Yesterday' },
      };
    case 'year': {
      const prev = y - 1;
      return {
        key,
        from: iso(y, 1, 1),
        to: today,
        label: String(y),
        grain: 'month',
        // The same slice of last year, so a year three months old is not
        // compared against twelve months of the one before it.
        previous: {
          from: iso(prev, 1, 1),
          to: iso(prev, m, Math.min(parts(today).d, daysInMonth(prev, m))),
          label: String(prev),
        },
      };
    }
    case 'custom': {
      const from = custom?.from || today;
      const to = custom?.to || today;
      const span = Math.max(daysBetween(from, to), 1);
      return {
        key,
        from,
        to,
        label: from === to ? from : `${from} → ${to}`,
        grain: span > 62 ? 'month' : 'day',
        previous: {
          from: addDays(from, -span),
          to: addDays(from, -1),
          label: 'Previous period',
        },
      };
    }
    case 'month':
    default: {
      const prevMonth = m === 1 ? 12 : m - 1;
      const prevYear = m === 1 ? y - 1 : y;
      return {
        key: 'month',
        from: iso(y, m, 1),
        to: today,
        label: 'This Month',
        grain: 'day',
        previous: {
          from: iso(prevYear, prevMonth, 1),
          // Same day-of-month, clamped — comparing 18 days against 31 would
          // report a collapse every month.
          to: iso(prevYear, prevMonth, Math.min(parts(today).d, daysInMonth(prevYear, prevMonth))),
          label: 'Last Month',
        },
      };
    }
  }
};

/**
 * A rate, or `null` when there is nothing to divide by.
 *
 * Never 0. "0%" is a claim — nobody converted anything — and a denominator of
 * zero does not support it; the UI renders `null` as "No data" instead. This is
 * the single guard behind every percentage in the module.
 */
export const rate = (numerator: number, denominator: number): number | null => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
};

/** "62.5%" or "No data". */
export const formatRate = (value: number | null, fallback = 'No data'): string =>
  value === null ? fallback : `${Number.isInteger(value) ? value : value.toFixed(1)}%`;

export interface Delta {
  /** Percentage change, or null when the previous period has nothing to compare. */
  value: number | null;
  direction: 'up' | 'down' | 'flat' | 'unknown';
}

/**
 * Change against the previous period.
 *
 * A previous period of zero has no percentage — "up 100%" from nothing is a
 * number the reader will act on and it means only "there was none before". That
 * case returns `unknown`, and the UI says "no comparable data".
 */
export const delta = (current: number, previous: number): Delta => {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return { value: null, direction: 'unknown' };
  }
  const change = Math.round(((current - previous) / previous) * 1000) / 10;
  return {
    value: change,
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
  };
};

/**
 * The status vocabulary for a work item.
 *
 * Overdue is not a stored status anywhere in this database — it is an open item
 * whose due date has passed, decided against today. Keeping it out of the
 * stored set is what stops a cancelled item from staying "overdue" forever.
 *
 * `on_hold` and `cancelled` are here for tasks the app cannot yet produce: the
 * `task_status` enum is pending/in_progress/completed only. Site visits do
 * cancel, so `cancelled` is reachable; `on_hold` is not, and is deliberately
 * absent rather than faked.
 */
export type WorkStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled' | 'overdue';

export const workStatusMeta: Record<
  WorkStatus,
  { label: string; tone: 'neutral' | 'info' | 'progress' | 'success' | 'warning' | 'danger' }
> = {
  not_started: { label: 'Not Started', tone: 'neutral' },
  in_progress: { label: 'In Progress', tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  overdue: { label: 'Overdue', tone: 'danger' },
};

/**
 * Is this item late?
 *
 * Mirrors the SQL exactly: a due date in the past, and a status that is neither
 * completed nor cancelled. Both sides compare against the business day, so an
 * item due today is never overdue anywhere in the app.
 */
export const isOverdue = (
  item: { due_date: string | null; status: string },
  today: string = businessDate()
): boolean =>
  Boolean(item.due_date) &&
  item.due_date! < today &&
  item.status !== 'completed' &&
  item.status !== 'cancelled';

export type WorkKind = 'task' | 'visit' | 'lead' | 'project';

export const workKindMeta: Record<WorkKind, { label: string; plural: string }> = {
  task: { label: 'Task', plural: 'Tasks' },
  visit: { label: 'Site Visit', plural: 'Site Visits' },
  lead: { label: 'Lead', plural: 'Leads' },
  project: { label: 'Project', plural: 'Projects' },
};

/**
 * The headline each role is measured on. One metric per role keeps target and
 * achievement in the same unit — a rupee target compared against a call count
 * is how a dashboard starts lying.
 */
export const TARGET_METRICS = {
  revenue: { label: 'Revenue', unit: 'currency' as const },
  connected_calls: { label: 'Connected Calls', unit: 'count' as const },
  projects_completed: { label: 'Projects Completed', unit: 'count' as const },
};

export type TargetMetric = keyof typeof TARGET_METRICS;

export const targetMetricForRole = (role: string): TargetMetric =>
  role === 'sales_person' ? 'revenue' : role === 'telecaller' ? 'connected_calls' : 'projects_completed';

/**
 * Plain-language statements of every formula on screen, shown in the tooltip
 * beside the figure. A percentage nobody can reconstruct is a percentage nobody
 * trusts.
 */
export const FORMULAS = {
  completion: 'Completed work ÷ work assigned in this period × 100.',
  taskCompletion: 'Completed tasks ÷ tasks assigned in this period × 100.',
  onTime:
    'Work completed on or before its due date ÷ completed work that had a due date × 100. Items with no due date are left out of both sides.',
  achievement: 'Achieved ÷ target × 100. Monthly targets are pro-rated by the days the period covers.',
  callCompletion: 'Calls dialled ÷ leads assigned to call × 100.',
  connection:
    'Connected calls ÷ calls dialled × 100. Busy, unanswered, switched off, wrong and unreachable numbers are Not Connected and never count as connected.',
  interest: 'Leads marked interested ÷ connected calls × 100.',
  followUp: 'Follow-ups completed ÷ follow-ups that fell due in this period × 100.',
  contact: 'Leads contacted ÷ leads assigned × 100. A call or a completed visit counts as contact.',
  qualification: 'Qualified leads ÷ leads contacted × 100.',
  conversion: 'Leads that became projects ÷ leads assigned × 100.',
  workCompletion: 'Completed work ÷ assigned work × 100.',
  delay: 'Projects past their expected install date and not finished ÷ projects assigned × 100.',
} as const;

/**
 * The counts that must add up, checked rather than assumed.
 *
 * Every item assigned in a period is completed, cancelled, pending or overdue —
 * one of four, never two. The SQL counts them with mutually exclusive FILTERs;
 * this is the arithmetic statement of that, used by the tests and by the
 * reconciliation note under the summary table.
 */
export const reconciles = (row: {
  work_assigned: number;
  work_completed: number;
  work_pending: number;
  work_overdue: number;
  work_cancelled: number;
}): boolean =>
  row.work_completed + row.work_pending + row.work_overdue + row.work_cancelled === row.work_assigned;
