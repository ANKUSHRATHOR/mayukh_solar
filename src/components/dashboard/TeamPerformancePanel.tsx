import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, startOfWeek, subMonths, endOfMonth } from 'date-fns';
import { Download, Users } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import StatusBadge from '@/components/common/StatusBadge';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadCsv } from '@/lib/exportCsv';
import { cn } from '@/lib/utils';

/**
 * Employee-by-employee activity for telecallers and sales reps.
 *
 * `staff_performance` on /admin/performance answers an HR question — leads and
 * attendance for every role. This answers a sales one: who is calling, who is
 * getting through, and what came of it. Both read the same staff table; neither
 * replaces the other.
 */

interface TeamRow {
  user_id: string;
  full_name: string;
  role: string;
  dialed: number;
  connected: number;
  not_connected: number;
  leads_created: number;
  leads_assigned: number;
  visits_booked: number;
  visits_completed: number;
  interested: number;
  follow_ups_set: number;
  not_interested: number;
  projects_created: number;
  follow_ups_overdue: number;
}

type RangeKey = 'today' | 'this_week' | 'this_month' | 'last_month' | 'custom';
type RoleKey = 'all' | 'telecaller' | 'sales_person';

const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'Today',
  this_week: 'This week',
  this_month: 'This month',
  last_month: 'Last month',
  custom: 'Custom range',
};

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

const rangeFor = (key: RangeKey, customFrom: string, customTo: string) => {
  const today = new Date();
  switch (key) {
    case 'today':
      return { from: iso(today), to: iso(today) };
    case 'this_week':
      return { from: iso(startOfWeek(today, { weekStartsOn: 1 })), to: iso(today) };
    case 'last_month': {
      const prev = subMonths(today, 1);
      return { from: iso(startOfMonth(prev)), to: iso(endOfMonth(prev)) };
    }
    case 'custom':
      return { from: customFrom, to: customTo };
    default:
      return { from: iso(startOfMonth(today)), to: iso(today) };
  }
};

/** Connect rate, the number that says whether the dialling is working. */
const connectRate = (row: TeamRow) =>
  row.dialed > 0 ? Math.round((row.connected / row.dialed) * 100) : 0;

const roleMeta = {
  telecaller: { label: 'Telecaller', tone: 'info' as const },
  sales_person: { label: 'Sales Rep', tone: 'progress' as const },
};

const TeamPerformancePanel = () => {
  const [rangeKey, setRangeKey] = useState<RangeKey>('this_month');
  const [customFrom, setCustomFrom] = useState(iso(startOfMonth(new Date())));
  const [customTo, setCustomTo] = useState(iso(new Date()));
  const [roleFilter, setRoleFilter] = useState<RoleKey>('all');

  const { from, to } = rangeFor(rangeKey, customFrom, customTo);

  const query = useQuery({
    queryKey: ['team-activity-performance', from, to],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as SupabaseClient).rpc(
        'team_activity_performance',
        { _from: from, _to: to }
      );
      if (error) throw new Error(error.message);
      return (data ?? []) as TeamRow[];
    },
    // A custom range with a half-filled date pair would query nonsense.
    enabled: Boolean(from && to),
  });

  const rows = useMemo(
    () => (query.data ?? []).filter((r) => roleFilter === 'all' || r.role === roleFilter),
    [query.data, roleFilter]
  );

  // The team's own row. Summing the people is the whole point of the tab, and it
  // saves the reader adding up six numbers to see whether today went well.
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          dialed: acc.dialed + r.dialed,
          connected: acc.connected + r.connected,
          not_connected: acc.not_connected + r.not_connected,
          leads_created: acc.leads_created + r.leads_created,
          visits_booked: acc.visits_booked + r.visits_booked,
          visits_completed: acc.visits_completed + r.visits_completed,
          interested: acc.interested + r.interested,
          projects_created: acc.projects_created + r.projects_created,
          follow_ups_overdue: acc.follow_ups_overdue + r.follow_ups_overdue,
        }),
        {
          dialed: 0, connected: 0, not_connected: 0, leads_created: 0, visits_booked: 0,
          visits_completed: 0, interested: 0, projects_created: 0, follow_ups_overdue: 0,
        }
      ),
    [rows]
  );

  const exportCsv = () => {
    downloadCsv(`team-performance-${from}_${to}.csv`, [
      { header: 'Staff', value: (r: TeamRow) => r.full_name },
      { header: 'Role', value: (r: TeamRow) => (r.role === 'telecaller' ? 'Telecaller' : 'Sales Rep') },
      { header: 'Dialled', value: (r: TeamRow) => r.dialed },
      { header: 'Connected', value: (r: TeamRow) => r.connected },
      { header: 'Not Connected', value: (r: TeamRow) => r.not_connected },
      { header: 'Connect %', value: (r: TeamRow) => connectRate(r) },
      { header: 'Interested', value: (r: TeamRow) => r.interested },
      { header: 'Follow-ups Set', value: (r: TeamRow) => r.follow_ups_set },
      { header: 'Not Interested', value: (r: TeamRow) => r.not_interested },
      { header: 'Leads Created', value: (r: TeamRow) => r.leads_created },
      { header: 'Leads Assigned', value: (r: TeamRow) => r.leads_assigned },
      { header: 'Visits Booked', value: (r: TeamRow) => r.visits_booked },
      { header: 'Visits Completed', value: (r: TeamRow) => r.visits_completed },
      { header: 'Projects Created', value: (r: TeamRow) => r.projects_created },
      { header: 'Follow-ups Overdue', value: (r: TeamRow) => r.follow_ups_overdue },
    ], rows);
  };

  return (
    <div className="space-y-4">
      {/* Controls: period, role, export — in that order, like every list page. */}
      <Card className="shadow-card border-border">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:p-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Period</Label>
            <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as RangeKey)}>
              <SelectTrigger className="h-11 w-full text-sm sm:h-9 sm:w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
                  <SelectItem key={k} value={k}>{RANGE_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {rangeKey === 'custom' && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">From</Label>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-11 text-sm sm:h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">To</Label>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-11 text-sm sm:h-9" />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Role</Label>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleKey)}>
              <SelectTrigger className="h-11 w-full text-sm sm:h-9 sm:w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="telecaller">Telecallers</SelectItem>
                <SelectItem value="sales_person">Sales reps</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="h-11 gap-2 sm:ml-auto sm:h-9"
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      ) : query.error ? (
        <ErrorState error={query.error as Error} onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff to compare"
          description="Telecallers and sales reps appear here once they are active."
        />
      ) : (
        <Card className="shadow-card border-border">
          {/* A comparison is read across rows, so this stays a table at every
              width and scrolls sideways when it must. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-border/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Staff</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Dialled</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Connected</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Not conn.</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Connect %</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Interested</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Leads</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Visits booked</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Visits done</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Projects</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rate = connectRate(r);
                  return (
                    <tr key={r.user_id} className="border-b border-border/30 last:border-0 hover:bg-accent/30">
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-semibold text-foreground">{r.full_name}</span>
                          <StatusBadge value={r.role} map={roleMeta} size="sm" />
                        </div>
                      </td>
                      <td className="px-2 py-3 text-right font-semibold tabular-nums">{r.dialed}</td>
                      <td className="px-2 py-3 text-right tabular-nums text-success">{r.connected}</td>
                      <td className="px-2 py-3 text-right tabular-nums text-muted-foreground">{r.not_connected}</td>
                      <td
                        className={cn(
                          'px-2 py-3 text-right font-semibold tabular-nums',
                          r.dialed === 0 ? 'text-muted-foreground/60' : rate >= 50 ? 'text-success' : 'text-warning'
                        )}
                      >
                        {r.dialed === 0 ? '—' : `${rate}%`}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">{r.interested}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{r.leads_created}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{r.visits_booked}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{r.visits_completed}</td>
                      <td className="px-2 py-3 text-right font-semibold tabular-nums text-primary">{r.projects_created}</td>
                      <td
                        className={cn(
                          'px-4 py-3 text-right tabular-nums',
                          r.follow_ups_overdue > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'
                        )}
                      >
                        {r.follow_ups_overdue}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-border bg-muted/30 text-xs">
                <tr>
                  <td className="px-4 py-2.5 font-bold text-foreground">
                    Team total<span className="ml-2 font-normal text-muted-foreground">{rows.length} staff</span>
                  </td>
                  <td className="px-2 py-2.5 text-right font-bold tabular-nums">{totals.dialed}</td>
                  <td className="px-2 py-2.5 text-right font-bold tabular-nums">{totals.connected}</td>
                  <td className="px-2 py-2.5 text-right font-bold tabular-nums">{totals.not_connected}</td>
                  <td className="px-2 py-2.5 text-right font-bold tabular-nums">
                    {totals.dialed === 0 ? '—' : `${Math.round((totals.connected / totals.dialed) * 100)}%`}
                  </td>
                  <td className="px-2 py-2.5 text-right font-bold tabular-nums">{totals.interested}</td>
                  <td className="px-2 py-2.5 text-right font-bold tabular-nums">{totals.leads_created}</td>
                  <td className="px-2 py-2.5 text-right font-bold tabular-nums">{totals.visits_booked}</td>
                  <td className="px-2 py-2.5 text-right font-bold tabular-nums">{totals.visits_completed}</td>
                  <td className="px-2 py-2.5 text-right font-bold tabular-nums">{totals.projects_created}</td>
                  <td className="px-4 py-2.5 text-right font-bold tabular-nums">{totals.follow_ups_overdue}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Dialled counts every call started from a lead. Connected and Not connected come from the
        call log, so a dial nobody wrote up is in Dialled but neither of the other two. Overdue
        follow-ups are current, not for the period.
      </p>
    </div>
  );
};

export default TeamPerformancePanel;
