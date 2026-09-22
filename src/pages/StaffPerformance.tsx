import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Activity,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Download,
  Gauge,
  Timer,
  TriangleAlert,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import SectionCard from '@/components/common/SectionCard';
import ErrorState from '@/components/common/ErrorState';
import EmptyState from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import KpiCard from '@/components/performance/KpiCard';
import PerformanceControls, {
  type PerformanceControlsValue,
} from '@/components/performance/PerformanceControls';
import PerformanceCharts from '@/components/performance/PerformanceCharts';
import ActionCenter from '@/components/performance/ActionCenter';
import EmployeeLeaderboard from '@/components/performance/EmployeeLeaderboard';
import WorkItemsPanel from '@/components/performance/WorkItemsPanel';
import WorkDrillDownDialog, { type DrillDown } from '@/components/performance/WorkDrillDownDialog';
import TargetDialog from '@/components/performance/TargetDialog';
import {
  OperationsSection,
  SalesSection,
  TelecallerSection,
  sumRows,
} from '@/components/performance/RoleBreakdown';
import { downloadCsv } from '@/lib/exportCsv';
import {
  businessDate,
  delta,
  FORMULAS,
  formatRate,
  periodRange,
  rate,
  type PeriodKey,
} from '@/lib/performance';
import {
  fetchPerformanceOverview,
  fetchPerformanceTrend,
  fetchWorkItems,
  type PerformanceRow,
  type WorkBucket,
} from '@/lib/performanceData';

/**
 * Performance.
 *
 * The page used to be a date pair and one table of leads-and-attendance. It now
 * answers the questions a manager opens it with — what was assigned, what is
 * done, what is pending, what is late, who is behind, and which records are
 * behind each number — and every figure on it opens the rows it counted.
 *
 * Three rules shape the layout:
 *
 *  * The period governs everything. One control at the top; tiles, charts,
 *    role sections, leaderboard and table all read the same two dates.
 *  * Summary first, detail below. Six tiles, then what needs attention, then
 *    the charts, then the per-role figures, then people, then the records.
 *  * Nothing is computed twice. Every count comes from `performance_overview`
 *    and every list from `performance_work_items`, which read the same view
 *    with the same predicates — so a tile and its drill-down cannot disagree.
 *
 * The original HR summary (`staff_performance`: leads and attendance) is intact
 * at the bottom, collapsed. It answers a different question and nothing here
 * replaces it.
 */

interface HrRow {
  user_id: string;
  full_name: string;
  role: string;
  leads_created: number;
  leads_assigned: number;
  projects_completed: number;
  present_days: number;
  absent_days: number;
  attendance_pct: number;
}

const StaffPerformance = () => {
  const { role, user } = useAuth();
  const isAdmin = role === 'admin';
  const today = businessDate();

  const [controls, setControls] = useState<PerformanceControlsValue>({
    period: 'month',
    customFrom: `${today.slice(0, 7)}-01`,
    customTo: today,
    role: 'all',
    staff: 'all',
  });
  const [bucket, setBucket] = useState<WorkBucket>('assigned');
  const [drill, setDrill] = useState<DrillDown | null>(null);
  const [targetRow, setTargetRow] = useState<PerformanceRow | null>(null);

  const range = useMemo(
    () =>
      periodRange(controls.period as PeriodKey, {
        from: controls.customFrom,
        to: controls.customTo,
      }),
    [controls.period, controls.customFrom, controls.customTo]
  );

  const filters = {
    from: range.from,
    to: range.to,
    role: controls.role === 'all' ? null : controls.role,
    // A non-admin is pinned to their own figures by the database regardless of
    // what is sent; this only keeps the request honest.
    staff: !isAdmin ? (user?.id ?? null) : controls.staff === 'all' ? null : controls.staff,
  };

  const overview = useQuery({
    queryKey: ['performance-overview', filters],
    queryFn: () => fetchPerformanceOverview(filters),
  });

  // The same call over the previous period, for the comparison line on the
  // tiles. Separate query so a slow comparison never delays the figures.
  const previous = useQuery({
    queryKey: ['performance-overview', { ...filters, from: range.previous.from, to: range.previous.to }],
    queryFn: () =>
      fetchPerformanceOverview({ ...filters, from: range.previous.from, to: range.previous.to }),
  });

  const trend = useQuery({
    queryKey: ['performance-trend', filters, range.grain],
    queryFn: () => fetchPerformanceTrend({ ...filters, grain: range.grain }),
  });

  // Due today is a current worklist, not a period count, so it has its own
  // one-row probe rather than a column on the overview.
  const dueToday = useQuery({
    queryKey: ['performance-due-today', filters],
    queryFn: () => fetchWorkItems({ ...filters, bucket: 'due_today', limit: 1 }),
  });

  const hr = useQuery({
    queryKey: ['staff-performance', range.from, range.to],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as SupabaseClient).rpc('staff_performance', {
        _from: range.from,
        _to: range.to,
      });
      if (error) throw new Error(error.message);
      return (data as HrRow[]) ?? [];
    },
    enabled: isAdmin,
  });

  const rows = useMemo(() => overview.data ?? [], [overview.data]);
  const totals = useMemo(() => sumRows(rows), [rows]);
  const previousTotals = useMemo(() => sumRows(previous.data ?? []), [previous.data]);

  const byRole = (wanted: string) => rows.filter((r) => r.role === wanted);
  const telecallers = byRole('telecaller');
  const sales = byRole('sales_person');
  const operations = rows.filter((r) => ['operator', 'welder', 'electrician'].includes(r.role));

  const belowTarget = rows.filter((r) => {
    const pct = r.target_value ? rate(r.achievement, r.target_value) : null;
    return pct !== null && pct < 100;
  }).length;

  /** Every drill-down inherits the page's role and employee filters. */
  const openDrill = (bucket: WorkBucket, title?: string, staffId?: string) =>
    setDrill({ bucket, title, role: filters.role, staff: staffId ?? filters.staff });

  const exportSummary = () =>
    downloadCsv(`performance-summary-${range.from}_${range.to}.csv`, [
      { header: 'Staff', value: (r: PerformanceRow) => r.full_name },
      { header: 'Role', value: (r: PerformanceRow) => r.role },
      { header: 'Work Assigned', value: (r: PerformanceRow) => r.work_assigned },
      { header: 'Completed', value: (r: PerformanceRow) => r.work_completed },
      { header: 'Pending', value: (r: PerformanceRow) => r.work_pending },
      { header: 'Overdue', value: (r: PerformanceRow) => r.work_overdue },
      { header: 'Cancelled', value: (r: PerformanceRow) => r.work_cancelled },
      {
        header: 'Completion %',
        value: (r: PerformanceRow) => formatRate(rate(r.work_completed, r.work_assigned), 'No data'),
      },
      {
        header: 'On-time %',
        value: (r: PerformanceRow) => formatRate(rate(r.work_on_time, r.work_on_time_eligible), 'No data'),
      },
      { header: 'Tasks Assigned', value: (r: PerformanceRow) => r.tasks_assigned },
      { header: 'Tasks Completed', value: (r: PerformanceRow) => r.tasks_completed },
      { header: 'Tasks Pending', value: (r: PerformanceRow) => r.tasks_pending },
      { header: 'Tasks Overdue', value: (r: PerformanceRow) => r.tasks_overdue },
      { header: 'Target Metric', value: (r: PerformanceRow) => r.target_metric },
      { header: 'Target', value: (r: PerformanceRow) => (r.target_value === null ? 'Not set' : Math.round(r.target_value)) },
      { header: 'Achievement', value: (r: PerformanceRow) => Math.round(r.achievement) },
      {
        header: 'Achievement %',
        value: (r: PerformanceRow) =>
          r.target_value ? formatRate(rate(r.achievement, r.target_value), 'No data') : 'No target',
      },
      { header: 'Calls Dialled', value: (r: PerformanceRow) => r.calls_dialed },
      { header: 'Calls Connected', value: (r: PerformanceRow) => r.calls_connected },
      { header: 'Leads Assigned', value: (r: PerformanceRow) => r.leads_assigned },
      { header: 'Won', value: (r: PerformanceRow) => r.deals_won },
      { header: 'Revenue', value: (r: PerformanceRow) => Math.round(r.revenue) },
    ], rows);

  const exportHr = () =>
    downloadCsv(`staff-attendance-${range.from}_${range.to}.csv`, [
      { header: 'Name', value: (r: HrRow) => r.full_name },
      { header: 'Role', value: (r: HrRow) => r.role },
      { header: 'Leads Created', value: (r: HrRow) => r.leads_created },
      { header: 'Leads Assigned', value: (r: HrRow) => r.leads_assigned },
      { header: 'Projects Completed', value: (r: HrRow) => r.projects_completed },
      { header: 'Present', value: (r: HrRow) => r.present_days },
      { header: 'Absent', value: (r: HrRow) => r.absent_days },
      { header: 'Attendance %', value: (r: HrRow) => r.attendance_pct },
    ], hr.data ?? []);

  const completion = rate(totals.work_completed, totals.work_assigned);
  const onTime = rate(totals.work_on_time, totals.work_on_time_eligible);
  const achievementPct = totals.target_value ? rate(totals.achievement, totals.target_value) : null;

  return (
    <PageContainer>
      <PageHeader
        title="Performance"
        description={
          isAdmin
            ? 'Assigned work, outcomes and targets across the team. Every figure opens its records.'
            : 'Your assigned work, outcomes and targets.'
        }
        icon={Gauge}
        meta={
          <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wide">
            {range.label}
          </Badge>
        }
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={exportSummary}
            aria-label="Export the performance summary as CSV"
            disabled={rows.length === 0}
            className="h-10 gap-1.5 sm:h-9"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        }
      />

      <PerformanceControls
        value={controls}
        onChange={setControls}
        range={range}
        employees={rows.map((r) => ({ user_id: r.user_id, full_name: r.full_name, role: r.role }))}
        canFilterPeople={isAdmin}
      />

      {overview.error ? (
        <ErrorState error={overview.error as Error} onRetry={() => overview.refetch()} />
      ) : overview.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No staff match these filters"
          description="Performance covers active staff who hold a role. Widen the role or employee filter."
        />
      ) : (
        <>
          {/* Summary. Six figures, in the order the questions get asked. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              title="Work assigned"
              value={totals.work_assigned}
              icon={ClipboardList}
              accent="info"
              formula="Tasks, site visits, leads and projects handed to these people between these dates."
              delta={delta(totals.work_assigned, previousTotals.work_assigned)}
              deltaLabel={range.previous.label}
              onClick={() => openDrill('assigned')}
            />
            <KpiCard
              title="Completed"
              value={totals.work_completed}
              icon={CheckCircle2}
              accent="success"
              formula="Of the work assigned in this period, how much is now finished."
              delta={delta(totals.work_completed, previousTotals.work_completed)}
              deltaLabel={range.previous.label}
              onClick={() => openDrill('completed')}
            />
            <KpiCard
              title="Pending"
              value={totals.work_pending}
              icon={Timer}
              accent="warning"
              formula="Open work from this period that is not yet past its due date."
              onClick={() => openDrill('pending')}
            />
            <KpiCard
              title="Overdue"
              value={totals.work_overdue}
              icon={TriangleAlert}
              accent="destructive"
              formula="Open work from this period whose due date has passed. Cancelled work is never overdue."
              delta={delta(totals.work_overdue, previousTotals.work_overdue)}
              deltaLabel={range.previous.label}
              onClick={() => openDrill('overdue')}
            />
            <KpiCard
              title="Completion rate"
              value={formatRate(completion)}
              icon={Gauge}
              accent="primary"
              formula={FORMULAS.completion}
            />
            <KpiCard
              title="On-time rate"
              value={formatRate(onTime)}
              icon={CalendarCheck}
              accent="info"
              formula={FORMULAS.onTime}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              title="Tasks assigned"
              value={totals.tasks_assigned}
              icon={ClipboardList}
              accent="info"
              formula="Tasks only, excluding leads, visits and projects."
            />
            <KpiCard
              title="Tasks completed"
              value={totals.tasks_completed}
              icon={CheckCircle2}
              accent="success"
              formula={FORMULAS.taskCompletion}
            />
            <KpiCard
              title="Tasks overdue"
              value={totals.tasks_overdue}
              icon={TriangleAlert}
              accent="destructive"
              formula="Tasks past their due date that are neither completed nor cancelled."
            />
            <KpiCard
              title="Target"
              value={totals.target_value === null ? 'Not set' : Math.round(totals.target_value).toLocaleString('en-IN')}
              icon={Gauge}
              accent="primary"
              formula="Monthly targets for the people on screen, pro-rated by the days this period covers."
            />
            <KpiCard
              title="Achieved"
              value={Math.round(totals.achievement).toLocaleString('en-IN')}
              icon={Activity}
              accent="success"
              formula="Revenue for sales, connected calls for telecallers, completed projects for everyone else."
            />
            <KpiCard
              title="Achievement"
              value={achievementPct === null ? 'No target' : formatRate(achievementPct)}
              icon={Gauge}
              accent={achievementPct !== null && achievementPct >= 100 ? 'success' : 'warning'}
              formula={FORMULAS.achievement}
            />
          </div>

          <ActionCenter
            dueToday={dueToday.data?.total ?? 0}
            overdue={totals.work_overdue}
            followUpsOverdue={totals.follow_ups_overdue}
            notAttempted={totals.calls_not_attempted}
            projectsDelayed={totals.projects_delayed}
            belowTarget={belowTarget}
            onDrill={(b, title) => openDrill(b, title)}
          />

          <PerformanceCharts rows={rows} trend={trend.data ?? []} grain={range.grain} />

          {/* Role sections appear only when the selection contains that role —
              an empty Telecalling block on a filtered view is just chrome. */}
          {telecallers.length > 0 && <TelecallerSection rows={telecallers} />}
          {sales.length > 0 && <SalesSection rows={sales} />}
          {operations.length > 0 && <OperationsSection rows={operations} />}

          {isAdmin && (
            <EmployeeLeaderboard
              rows={rows}
              onDrill={(b, staffId, title) => openDrill(b, title, staffId)}
              onSetTarget={setTargetRow}
            />
          )}

          <SectionCard
            title="Assigned work and tasks"
            description="Every record behind the figures above. Search, filter, sort and open."
            icon={ClipboardList}
          >
            <WorkItemsPanel
              from={range.from}
              to={range.to}
              role={filters.role}
              staff={filters.staff}
              bucket={bucket}
              onBucketChange={setBucket}
              counts={{
                assigned: totals.work_assigned,
                pending: totals.work_pending,
                overdue: totals.work_overdue,
                completed: totals.work_completed,
                completed_in_period: totals.work_completed_in_period,
                cancelled: totals.work_cancelled,
                due_today: dueToday.data?.total,
              }}
            />
          </SectionCard>
        </>
      )}

      {isAdmin && (
        <SectionCard
          title="Attendance and leads (HR summary)"
          description="The original per-staff figures, unchanged."
          icon={CalendarCheck}
          collapsible
          defaultOpen={false}
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportHr}
              aria-label="Export the attendance summary as CSV"
              disabled={!hr.data?.length}
              className="h-9 gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          }
        >
          {hr.isLoading ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : hr.error ? (
            <ErrorState error={hr.error as Error} onRetry={() => hr.refetch()} />
          ) : !hr.data?.length ? (
            <EmptyState icon={CalendarCheck} title="No attendance in this period" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-border/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2">Staff</th>
                    <th className="px-2 py-2">Role</th>
                    <th className="px-2 py-2 text-right">Leads created</th>
                    <th className="px-2 py-2 text-right">Leads assigned</th>
                    <th className="px-2 py-2 text-right">Projects done</th>
                    <th className="px-2 py-2 text-right">Present</th>
                    <th className="px-2 py-2 text-right">Absent</th>
                    <th className="px-2 py-2 text-right">Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {hr.data.map((r) => (
                    <tr key={r.user_id} className="border-b border-border/30 last:border-0 hover:bg-accent/20">
                      <td className="px-2 py-2.5 font-medium">{r.full_name}</td>
                      <td className="px-2 py-2.5 text-xs capitalize text-muted-foreground">
                        {r.role?.replace(/_/g, ' ')}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.leads_created}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.leads_assigned}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.projects_completed}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-success">{r.present_days}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-destructive">{r.absent_days}</td>
                      <td className="px-2 py-2.5 text-right font-bold tabular-nums text-primary">
                        {r.attendance_pct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      <WorkDrillDownDialog
        drill={drill}
        onOpenChange={(open) => !open && setDrill(null)}
        from={range.from}
        to={range.to}
        periodLabel={range.label}
      />

      <TargetDialog
        row={targetRow}
        defaultMonth={range.from.slice(0, 7)}
        onOpenChange={(open) => !open && setTargetRow(null)}
      />
    </PageContainer>
  );
};

export default StaffPerformance;
