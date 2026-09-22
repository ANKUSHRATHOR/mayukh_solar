import { Target as TargetIcon, Trophy } from 'lucide-react';
import SectionCard from '@/components/common/SectionCard';
import StatusBadge from '@/components/common/StatusBadge';
import EmptyState from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { formatRate, rate, TARGET_METRICS, type TargetMetric } from '@/lib/performance';
import type { PerformanceRow, WorkBucket } from '@/lib/performanceData';
import { cn } from '@/lib/utils';

const roleMeta = {
  telecaller: { label: 'Telecaller', tone: 'info' as const },
  sales_person: { label: 'Sales', tone: 'progress' as const },
  operator: { label: 'Operations', tone: 'success' as const },
  welder: { label: 'Welder', tone: 'neutral' as const },
  electrician: { label: 'Electrician', tone: 'neutral' as const },
  admin: { label: 'Admin', tone: 'neutral' as const },
};

const formatTarget = (metric: string, value: number) =>
  TARGET_METRICS[metric as TargetMetric]?.unit === 'currency'
    ? `₹${value >= 100_000 ? `${(value / 100_000).toFixed(1)}L` : Math.round(value).toLocaleString('en-IN')}`
    : String(Math.round(value));

interface EmployeeLeaderboardProps {
  rows: PerformanceRow[];
  onDrill: (bucket: WorkBucket, staffId: string, title: string) => void;
  /** Admin-only: opens the target editor for one person. */
  onSetTarget?: (row: PerformanceRow) => void;
}

/**
 * Everyone, side by side.
 *
 * A comparison is read across rows, so this stays a table at every width and
 * scrolls sideways when it must — the same call the team panel makes. Every
 * count is a button into that person's records for that slice, which is what
 * turns "Ramesh has 7 overdue" into something a manager can act on without
 * leaving to go hunting.
 */
const EmployeeLeaderboard = ({ rows, onDrill, onSetTarget }: EmployeeLeaderboardProps) => {
  if (rows.length === 0) {
    return (
      <SectionCard title="By employee" icon={Trophy}>
        <EmptyState
          icon={Trophy}
          title="Nobody matches these filters"
          description="Every active staff member with a role appears here. Widen the role or employee filter."
        />
      </SectionCard>
    );
  }

  // Best first, by what each role is measured on where a target exists, and by
  // completion where it does not.
  const ranked = [...rows].sort((a, b) => {
    const aPct = a.target_value ? (rate(a.achievement, a.target_value) ?? -1) : -1;
    const bPct = b.target_value ? (rate(b.achievement, b.target_value) ?? -1) : -1;
    if (aPct !== bPct) return bPct - aPct;
    return (rate(b.work_completed, b.work_assigned) ?? -1) - (rate(a.work_completed, a.work_assigned) ?? -1);
  });

  const countCell = (value: number, onClick: () => void, className?: string) => (
    <td className="px-2 py-2.5 text-right">
      <button
        type="button"
        onClick={onClick}
        disabled={value === 0}
        className={cn(
          'rounded px-1 font-semibold tabular-nums transition-colors',
          value === 0
            ? 'cursor-default text-muted-foreground/60'
            : 'hover:bg-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          className
        )}
      >
        {value}
      </button>
    </td>
  );

  return (
    <div id="performance-leaderboard">
    <SectionCard
      title="By employee"
      description="Click any number to see the records behind it."
      icon={Trophy}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-border/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-2.5 font-semibold">Staff</th>
              <th className="px-2 py-2.5 text-right font-semibold">Assigned</th>
              <th className="px-2 py-2.5 text-right font-semibold">Done</th>
              <th className="px-2 py-2.5 text-right font-semibold">Pending</th>
              <th className="px-2 py-2.5 text-right font-semibold">Overdue</th>
              <th className="px-2 py-2.5 text-right font-semibold">Completion</th>
              <th className="px-2 py-2.5 text-right font-semibold">On time</th>
              <th className="px-2 py-2.5 text-right font-semibold">Target</th>
              <th className="px-2 py-2.5 text-right font-semibold">Achieved</th>
              <th className="px-2 py-2.5 text-right font-semibold">vs Target</th>
              {onSetTarget && <th className="px-2 py-2.5" aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {ranked.map((row) => {
              const completion = rate(row.work_completed, row.work_assigned);
              const onTime = rate(row.work_on_time, row.work_on_time_eligible);
              const achievement = row.target_value ? rate(row.achievement, row.target_value) : null;
              return (
                <tr key={row.user_id} className="border-b border-border/30 last:border-0 hover:bg-accent/20">
                  <td className="px-2 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-semibold text-foreground">{row.full_name}</span>
                      <StatusBadge value={row.role} map={roleMeta} size="sm" />
                    </div>
                  </td>
                  {countCell(row.work_assigned, () =>
                    onDrill('assigned', row.user_id, `${row.full_name} — assigned`)
                  )}
                  {countCell(
                    row.work_completed,
                    () => onDrill('completed', row.user_id, `${row.full_name} — completed`),
                    'text-success'
                  )}
                  {countCell(
                    row.work_pending,
                    () => onDrill('pending', row.user_id, `${row.full_name} — pending`),
                    'text-warning'
                  )}
                  {countCell(
                    row.work_overdue,
                    () => onDrill('overdue', row.user_id, `${row.full_name} — overdue`),
                    'text-destructive'
                  )}
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {/* "No data" rather than 0% — nothing assigned supports no rate. */}
                    <span className={completion === null ? 'text-xs text-muted-foreground' : undefined}>
                      {formatRate(completion)}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    <span className={onTime === null ? 'text-xs text-muted-foreground' : undefined}>
                      {formatRate(onTime)}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right text-xs tabular-nums text-muted-foreground">
                    {row.target_value === null
                      ? 'Not set'
                      : formatTarget(row.target_metric, row.target_value)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {formatTarget(row.target_metric, row.achievement)}
                  </td>
                  <td
                    className={cn(
                      'px-2 py-2.5 text-right font-semibold tabular-nums',
                      achievement === null
                        ? 'text-xs font-normal text-muted-foreground'
                        : achievement >= 100
                          ? 'text-success'
                          : achievement >= 70
                            ? 'text-warning'
                            : 'text-destructive'
                    )}
                  >
                    {achievement === null ? 'No target' : formatRate(achievement)}
                  </td>
                  {onSetTarget && (
                    <td className="px-2 py-2.5 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Set a target for ${row.full_name}`}
                        className="h-8 gap-1 px-2 text-xs"
                        onClick={() => onSetTarget(row)}
                      >
                        <TargetIcon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Target</span>
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Assigned = completed + pending + overdue + cancelled, for work handed out in this period.
        Someone with nothing assigned shows "No data", never 0%.
      </p>
    </SectionCard>
    </div>
  );
};

export default EmployeeLeaderboard;
