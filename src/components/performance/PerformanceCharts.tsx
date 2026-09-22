import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import SectionCard from '@/components/common/SectionCard';
import EmptyState from '@/components/common/EmptyState';
import { BarChart3, LineChart as LineChartIcon, Target } from 'lucide-react';
import { formatRate, rate, TARGET_METRICS, type TargetMetric } from '@/lib/performance';
import type { PerformanceRow, TrendPoint } from '@/lib/performanceData';

/**
 * Colour carries the same meaning here as everywhere else in the module:
 * green completed, blue in progress, amber pending, red overdue, grey nothing.
 * Never alone, though — every series is labelled on its axis or in its tooltip,
 * and every figure this page colours also states its number.
 */
const SERIES = {
  completed: 'hsl(var(--success))',
  pending: 'hsl(var(--warning))',
  overdue: 'hsl(var(--destructive))',
  assigned: 'hsl(var(--info))',
  target: 'hsl(var(--muted-foreground))',
  achieved: 'hsl(var(--primary))',
} as const;

const compact = (value: number) =>
  value >= 10_000_000
    ? `${(value / 10_000_000).toFixed(1)}Cr`
    : value >= 100_000
      ? `${(value / 100_000).toFixed(1)}L`
      : value >= 1_000
        ? `${(value / 1_000).toFixed(1)}k`
        : String(Math.round(value));

const firstName = (name: string) => name.split(' ')[0];

const workConfig = {
  completed: { label: 'Completed', color: SERIES.completed },
  pending: { label: 'Pending', color: SERIES.pending },
  overdue: { label: 'Overdue', color: SERIES.overdue },
} satisfies ChartConfig;

const trendConfig = {
  assigned: { label: 'Assigned', color: SERIES.assigned },
  completed: { label: 'Completed', color: SERIES.completed },
} satisfies ChartConfig;

const targetConfig = {
  target: { label: 'Target', color: SERIES.target },
  achieved: { label: 'Achieved', color: SERIES.achieved },
} satisfies ChartConfig;

interface PerformanceChartsProps {
  rows: PerformanceRow[];
  trend: TrendPoint[];
  grain: 'day' | 'month';
}

/**
 * Three charts, and no more.
 *
 * Each one answers a question the tiles cannot: how the work splits, whether it
 * is going up or down, and who is short of their number. Anything else would be
 * the same figures drawn twice — the tiles above already state every total.
 */
const PerformanceCharts = ({ rows, trend, grain }: PerformanceChartsProps) => {
  const workBreakdown = useMemo(
    () =>
      rows
        .filter((r) => r.work_assigned > 0)
        .slice(0, 12)
        .map((r) => ({
          name: firstName(r.full_name),
          completed: r.work_completed,
          pending: r.work_pending,
          overdue: r.work_overdue,
        })),
    [rows]
  );

  // Only people who actually have a target. A bar of zero against an achievement
  // would read as "missed by everything" when the truth is nobody set a number.
  const targetRows = useMemo(
    () =>
      rows
        .filter((r) => r.target_value !== null && r.target_value > 0)
        .slice(0, 12)
        .map((r) => ({
          name: firstName(r.full_name),
          target: r.target_value as number,
          achieved: r.achievement,
          metric: r.target_metric as TargetMetric,
          pct: rate(r.achievement, r.target_value as number),
        })),
    [rows]
  );

  const trendData = useMemo(
    () =>
      trend.map((t) => ({
        ...t,
        label:
          grain === 'month'
            ? new Date(t.bucket).toLocaleDateString('en-IN', { month: 'short' })
            : new Date(t.bucket).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      })),
    [trend, grain]
  );

  return (
    <div className="grid gap-3 sm:gap-5 lg:grid-cols-2">
      <SectionCard
        title="Completed, pending and overdue"
        description="Work assigned in this period, by where it stands now."
        icon={BarChart3}
      >
        {workBreakdown.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No work assigned in this period"
            description="Nothing was handed out between these dates, so there is nothing to split."
          />
        ) : (
          <ChartContainer config={workConfig} className="aspect-[4/3] w-full sm:aspect-[2/1]">
            <BarChart data={workBreakdown} margin={{ left: -18, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} angle={-30} textAnchor="end" height={54} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} fontSize={11} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="completed" stackId="w" fill={SERIES.completed} radius={[0, 0, 0, 0]} />
              <Bar dataKey="pending" stackId="w" fill={SERIES.pending} />
              <Bar dataKey="overdue" stackId="w" fill={SERIES.overdue} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Green completed · amber pending · red overdue. Cancelled work is left out of all three.
        </p>
      </SectionCard>

      <SectionCard
        title="Target vs achievement"
        description="Monthly targets, pro-rated to the period on screen."
        icon={Target}
      >
        {targetRows.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No targets set"
            description="Set a monthly target for a person and their achievement appears here against it."
          />
        ) : (
          <ChartContainer config={targetConfig} className="aspect-[4/3] w-full sm:aspect-[2/1]">
            <BarChart data={targetRows} margin={{ left: -18, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} angle={-30} textAnchor="end" height={54} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={compact} fontSize={11} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => [
                      `${compact(Number(value))} `,
                      String(name) === 'target' ? 'Target' : 'Achieved',
                    ]}
                  />
                }
              />
              <Bar dataKey="target" fill={SERIES.target} fillOpacity={0.35} radius={[4, 4, 0, 0]} />
              {/* Achieved is coloured against its own target, so "behind" is
                  visible without reading the axis — and the percentage is
                  printed underneath, because colour alone is not a label. */}
              <Bar dataKey="achieved" radius={[4, 4, 0, 0]}>
                {targetRows.map((row) => (
                  <Cell
                    key={row.name}
                    fill={(row.pct ?? 0) >= 100 ? SERIES.completed : (row.pct ?? 0) >= 70 ? SERIES.achieved : SERIES.overdue}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
        {targetRows.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {targetRows.map((row) => (
              <span key={row.name}>
                <span className="font-semibold text-foreground">{row.name}</span>{' '}
                {formatRate(row.pct)} of {TARGET_METRICS[row.metric]?.label.toLowerCase() ?? 'target'}
              </span>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Trend"
        description={grain === 'month' ? 'Work assigned and completed, by month.' : 'Work assigned and completed, by day.'}
        icon={LineChartIcon}
        className="lg:col-span-2"
      >
        {trendData.length === 0 ? (
          <EmptyState icon={LineChartIcon} title="No trend for this period" description="A single day has nothing to trend against. Try This Month." />
        ) : (
          <ChartContainer config={trendConfig} className="aspect-[3/2] w-full sm:aspect-[4/1]">
            <LineChart data={trendData} margin={{ left: -18, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} minTickGap={16} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} fontSize={11} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="assigned" stroke={SERIES.assigned} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="completed" stroke={SERIES.completed} strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        )}
      </SectionCard>
    </div>
  );
};

export default PerformanceCharts;
