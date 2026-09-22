import { Headphones, Wrench, TrendingUp, Info } from 'lucide-react';
import SectionCard from '@/components/common/SectionCard';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { FORMULAS, formatRate, rate } from '@/lib/performance';
import type { PerformanceRow, WorkBucket } from '@/lib/performanceData';
import { cn } from '@/lib/utils';

export interface Metric {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  /** Shown in a tooltip beside the label — the formula, in words. */
  formula?: string;
  onClick?: () => void;
}

const toneClass = {
  neutral: 'text-foreground',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
};

/**
 * A block of figures.
 *
 * Deliberately not `StatCard`s: these are twelve to fifteen values read
 * together, and fifteen bordered, glowing tiles is the "509px of chrome above
 * the first record" mistake `StatStrip` was built to undo. This is the same
 * idea — one surface, hairline-separated — wrapped into a grid because fifteen
 * items do not fit one row.
 */
export const MetricGrid = ({ metrics }: { metrics: Metric[] }) => (
  <TooltipProvider delayDuration={200}>
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/70 bg-border/60 sm:grid-cols-3 lg:grid-cols-4">
      {metrics.map((metric) => {
        const interactive = typeof metric.onClick === 'function';
        return (
          <div
            key={metric.label}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            onClick={metric.onClick}
            onKeyDown={
              interactive
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      metric.onClick?.();
                    }
                  }
                : undefined
            }
            className={cn(
              'bg-card px-3 py-2.5 sm:px-4',
              interactive &&
                'cursor-pointer transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
            )}
          >
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase leading-tight tracking-[0.1em] text-muted-foreground">
              <span className="min-w-0 break-words">{metric.label}</span>
              {metric.formula && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label={`How ${metric.label} is calculated`} className="shrink-0">
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs leading-relaxed">
                    {metric.formula}
                  </TooltipContent>
                </Tooltip>
              )}
            </p>
            <p
              className={cn(
                'mt-1 text-lg font-extrabold leading-none tabular-nums',
                toneClass[metric.tone ?? 'neutral']
              )}
            >
              {metric.value}
            </p>
          </div>
        );
      })}
    </div>
  </TooltipProvider>
);

/** Adds up the people on screen, so a role section describes the selection. */
export const sumRows = (rows: PerformanceRow[]): PerformanceRow =>
  rows.reduce(
    (acc, row) => {
      const next = { ...acc } as Record<string, unknown>;
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'number') next[key] = ((acc as unknown as Record<string, number>)[key] ?? 0) + value;
      }
      return next as unknown as PerformanceRow;
    },
    { user_id: '', full_name: '', role: '', target_metric: '', target_value: null } as unknown as PerformanceRow
  );

const currency = (value: number) =>
  `₹${value >= 100_000 ? `${(value / 100_000).toFixed(1)}L` : value.toLocaleString('en-IN')}`;

interface RoleSectionProps {
  rows: PerformanceRow[];
  onDrill?: (bucket: WorkBucket, title: string) => void;
}

/**
 * Telecaller figures: what was handed out, what was dialled, what came back.
 *
 * "Connected" is the caller's own recorded outcome. Busy, unanswered, switched
 * off, wrong number and unreachable are all `not_connected` in `call_logs` and
 * none of them reach the connected count — which is why the connection rate is
 * worth reading at all.
 */
export const TelecallerSection = ({ rows }: RoleSectionProps) => {
  const t = sumRows(rows);
  const metrics: Metric[] = [
    { label: 'Leads to call', value: t.calls_assigned },
    { label: 'Calls dialled', value: t.calls_dialed },
    { label: 'Connected', value: t.calls_connected, tone: 'success' },
    { label: 'Not connected', value: t.calls_not_connected, tone: 'neutral' },
    { label: 'Not attempted', value: t.calls_not_attempted, tone: t.calls_not_attempted > 0 ? 'warning' : 'neutral' },
    { label: 'Dialled, not written up', value: t.calls_unlogged, tone: 'warning' },
    { label: 'Follow-ups set', value: t.follow_ups_scheduled },
    { label: 'Follow-ups due', value: t.follow_ups_due },
    { label: 'Follow-ups done', value: t.follow_ups_completed, tone: 'success' },
    { label: 'Follow-ups overdue', value: t.follow_ups_overdue, tone: t.follow_ups_overdue > 0 ? 'danger' : 'neutral' },
    { label: 'Interested', value: t.leads_interested, tone: 'success' },
    { label: 'Not interested', value: t.leads_not_interested },
    { label: 'Visits booked', value: t.visits_booked, tone: 'info' },
    {
      label: 'Call completion',
      value: formatRate(rate(t.calls_dialed, t.calls_assigned)),
      formula: FORMULAS.callCompletion,
    },
    {
      label: 'Connection rate',
      value: formatRate(rate(t.calls_connected, t.calls_dialed)),
      formula: FORMULAS.connection,
    },
    {
      label: 'Interest rate',
      value: formatRate(rate(t.leads_interested, t.calls_connected)),
      formula: FORMULAS.interest,
    },
    {
      label: 'Follow-up completion',
      value: formatRate(rate(t.follow_ups_completed, t.follow_ups_due)),
      formula: FORMULAS.followUp,
    },
    {
      label: 'Task completion',
      value: formatRate(rate(t.tasks_completed, t.tasks_assigned)),
      formula: FORMULAS.taskCompletion,
    },
  ];

  return (
    <SectionCard
      title="Telecalling"
      description="Calls, outcomes and follow-ups for the period."
      icon={Headphones}
    >
      <MetricGrid metrics={metrics} />
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Dialled counts each call once — pressing call and writing it up afterwards resolve the same
        record. Busy, unanswered, switched-off and wrong numbers are Not Connected.
      </p>
    </SectionCard>
  );
};

/** The sales funnel, as bars. Each stage states its own number and its share. */
const Funnel = ({ stages }: { stages: { label: string; value: number; tone: string }[] }) => {
  const top = Math.max(stages[0]?.value ?? 0, 1);
  return (
    <div className="space-y-1.5">
      {stages.map((stage) => {
        const share = rate(stage.value, top);
        return (
          <div key={stage.label} className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-[11px] font-medium text-muted-foreground sm:w-36">
              {stage.label}
            </span>
            <div className="h-6 min-w-0 flex-1 overflow-hidden rounded-md bg-muted">
              {/* A zero stage draws nothing at all. Rendered, its padding gave
                  it a 16px stub — a bar that says a stage happened when it
                  did not, which on a funnel is the one thing it must not do. */}
              {stage.value > 0 && (
                <div
                  className={cn('flex h-full items-center justify-end rounded-md px-2', stage.tone)}
                  style={{ width: `${Math.max(share ?? 0, 6)}%` }}
                >
                  <span className="text-[10px] font-bold text-white">{stage.value}</span>
                </div>
              )}
            </div>
            <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {stage.value === 0 ? '0' : formatRate(share)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Sales figures.
 *
 * "Won" is a lead that became a project — this app has no deal record between
 * the two (a lead converts straight to a project), so counting projects is
 * counting wins rather than inventing a parallel table for the report.
 */
export const SalesSection = ({ rows }: RoleSectionProps) => {
  const t = sumRows(rows);
  const metrics: Metric[] = [
    { label: 'Leads assigned', value: t.leads_assigned },
    { label: 'Leads contacted', value: t.leads_contacted },
    { label: 'Qualified', value: t.leads_qualified, tone: 'info' },
    { label: 'Follow-ups due', value: t.follow_ups_due },
    { label: 'Follow-ups done', value: t.follow_ups_completed, tone: 'success' },
    { label: 'Site visits done', value: t.visits_completed },
    { label: 'Quotations sent', value: t.quotations_sent },
    { label: 'Won', value: t.deals_won, tone: 'success' },
    { label: 'Lost', value: t.deals_lost, tone: 'danger' },
    { label: 'Revenue received', value: currency(t.revenue), tone: 'success' },
    { label: 'Pipeline value', value: currency(t.pipeline_value), tone: 'info' },
    { label: 'Contact rate', value: formatRate(rate(t.leads_contacted, t.leads_assigned)), formula: FORMULAS.contact },
    { label: 'Qualification rate', value: formatRate(rate(t.leads_qualified, t.leads_contacted)), formula: FORMULAS.qualification },
    { label: 'Conversion rate', value: formatRate(rate(t.deals_won, t.leads_assigned)), formula: FORMULAS.conversion },
    { label: 'Task completion', value: formatRate(rate(t.tasks_completed, t.tasks_assigned)), formula: FORMULAS.taskCompletion },
  ];

  return (
    <SectionCard title="Sales" description="Pipeline, conversion and money in." icon={TrendingUp}>
      <MetricGrid metrics={metrics} />
      <div className="mt-4 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Funnel
        </p>
        <Funnel
          stages={[
            { label: 'Assigned', value: t.leads_assigned, tone: 'bg-info' },
            { label: 'Contacted', value: t.leads_contacted, tone: 'bg-info/80' },
            { label: 'Qualified', value: t.leads_qualified, tone: 'bg-primary/80' },
            { label: 'Visit done', value: t.visits_completed, tone: 'bg-primary' },
            { label: 'Quotation', value: t.quotations_sent, tone: 'bg-warning' },
            { label: 'Won', value: t.deals_won, tone: 'bg-success' },
            { label: 'Lost', value: t.deals_lost, tone: 'bg-destructive' },
          ]}
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Each stage is measured against the leads assigned in this period. Revenue is money
          actually received against their projects, not the value of what was signed.
        </p>
      </div>
    </SectionCard>
  );
};

/**
 * Operations figures, against the existing 12-stage pipeline — no new stages.
 * "Applications submitted" is the move into Net Meter Applied, "approvals" is
 * Documents Approved or Loan Approved, both read from the audit trail that
 * already records who moved a project and when.
 */
export const OperationsSection = ({ rows }: RoleSectionProps) => {
  const t = sumRows(rows);
  const metrics: Metric[] = [
    { label: 'Projects assigned', value: t.projects_assigned },
    { label: 'Surveys assigned', value: t.surveys_assigned },
    { label: 'Surveys completed', value: t.surveys_completed, tone: 'success' },
    { label: 'Documents pending', value: t.documents_pending, tone: t.documents_pending > 0 ? 'warning' : 'neutral' },
    { label: 'Applications submitted', value: t.applications_submitted },
    { label: 'Approvals completed', value: t.approvals_completed, tone: 'success' },
    { label: 'Installs scheduled', value: t.installations_scheduled },
    { label: 'Installs completed', value: t.installations_completed, tone: 'success' },
    { label: 'Projects completed', value: t.projects_completed, tone: 'success' },
    { label: 'Projects delayed', value: t.projects_delayed, tone: t.projects_delayed > 0 ? 'danger' : 'neutral' },
    { label: 'Work completion', value: formatRate(rate(t.work_completed, t.work_assigned)), formula: FORMULAS.workCompletion },
    {
      label: 'On-time completion',
      value: formatRate(rate(t.work_on_time, t.work_on_time_eligible)),
      formula: FORMULAS.onTime,
    },
    { label: 'Delay rate', value: formatRate(rate(t.projects_delayed, t.projects_assigned)), formula: FORMULAS.delay },
    { label: 'Task completion', value: formatRate(rate(t.tasks_completed, t.tasks_assigned)), formula: FORMULAS.taskCompletion },
  ];

  return (
    <SectionCard
      title="Operations"
      description="Surveys, documents, approvals and installation."
      icon={Wrench}
    >
      <MetricGrid metrics={metrics} />
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Documents pending and projects delayed are current worklists, not period counts — they
        describe what is on this person's desk right now.
      </p>
    </SectionCard>
  );
};
