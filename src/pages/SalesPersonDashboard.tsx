import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, isPast } from 'date-fns';
import { AlertTriangle, CalendarCheck, CalendarClock, Clock, LayoutDashboard, ListChecks, MapPin } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import DataTable, { type DataTableColumn } from '@/components/common/DataTable';
import TableToolbar from '@/components/common/TableToolbar';
import TablePagination from '@/components/common/TablePagination';
import StatusBadge from '@/components/common/StatusBadge';
import StatCard from '@/components/dashboard/StatCard';
import LeadCallLink from '@/components/leads/LeadCallLink';
import { defaultTableView, type TableView } from '@/components/common/ViewToggle';
import { useStickyState } from '@/hooks/useStickyState';
import { useServerTable } from '@/hooks/useServerTable';
import { defaultSort } from '@/lib/tableQuery';
import { cn } from '@/lib/utils';
import {
  fetchMyVisitCounts,
  fetchMyVisitsPage,
  outcomeLabel,
  VISIT_FILTER_FIELDS,
  visitFieldOptions,
  type MyVisitScope,
  type VisitWithLead,
} from '@/lib/visits';
import { countApplied, type FilterCondition, type FilterField } from '@/lib/filterConditions';
import { leadStatusMeta } from '@/lib/statusMeta';
import { useStaffNames } from '@/hooks/useStaffNames';

const overdueMap = { overdue: { label: 'Overdue', tone: 'danger' as const } };

const emptyCopy: Record<MyVisitScope, { title: string; description: string }> = {
  today: { title: 'No visits left for today', description: 'Pending visits booked for today appear here.' },
  due: { title: 'Nothing overdue', description: 'Visits from earlier days that are still open appear here.' },
  all: { title: 'No visits assigned yet', description: 'Visits booked for you from a lead appear here.' },
};

/**
 * The sales rep's working day: their site visits.
 *
 * Three tiles — today's pending visits, everything assigned, and visits left
 * open from earlier days — and the tiles are the filter for the list below,
 * which opens on today's pending work.
 */
const SalesPersonDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scope, setScopeState] = useState<MyVisitScope>('today');
  const [conditions, setConditionsState] = useState<FilterCondition[]>([]);
  const [view, setView] = useStickyState<TableView>('sales-dashboard:view', defaultTableView());

  const { staff } = useStaffNames();
  const filterFields = useMemo<FilterField<never>[]>(() => {
    const people = Array.from(staff?.values() ?? [])
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
      .map((p) => ({ value: p.user_id, label: p.full_name }));
    const options = visitFieldOptions(
      people,
      Object.entries(leadStatusMeta).map(([value, m]) => ({ value, label: m.label }))
    );
    // Every visit here is already this rep's, so "Assigned to" would be noise.
    return VISIT_FILTER_FIELDS.filter((f) => f.key !== 'assigned_to_user_id').map((f) =>
      options[f.key] ? { ...f, options: options[f.key] } : f
    );
  }, [staff]);

  // The tiles are presets and the popover refines the full list. Applying a
  // filter therefore moves to "All assigned", and picking Today or Due clears
  // the filters — so a refinement never silently narrows a tile's count.
  const setScope = (next: MyVisitScope) => {
    setScopeState(next);
    if (next !== 'all') setConditionsState([]);
  };
  const setConditions = (next: FilterCondition[]) => {
    setConditionsState(next);
    if (countApplied(next, filterFields) > 0) setScopeState('all');
  };

  const filters = useMemo(
    () => ({ assignee: user?.id ?? '', scope, conditions }),
    [user?.id, scope, conditions]
  );

  const table = useServerTable<VisitWithLead>({
    queryKey: ['visits', 'mine'],
    fetchPage: fetchMyVisitsPage,
    initialSort: defaultSort('scheduled_for', 'asc'),
    filters,
    persistKey: 'sales-dashboard',
    enabled: !!user,
  });

  const { data: counts } = useQuery({
    queryKey: ['visits', 'mine', 'counts', user?.id],
    queryFn: () => fetchMyVisitCounts(user!.id),
    enabled: !!user,
  });

  const columns: DataTableColumn<VisitWithLead>[] = [
    {
      id: 'k_number',
      header: 'K-Number',
      mobile: 'title',
      cell: (v) =>
        v.leads?.k_number ? (
          <span className="font-mono text-xs font-bold text-foreground">{v.leads.k_number}</span>
        ) : (
          <span className="text-xs text-muted-foreground/60">Not linked</span>
        ),
    },
    {
      id: 'customer',
      header: 'Customer',
      mobile: 'subtitle',
      cell: (v) => (
        <div className="min-w-0">
          <div className="truncate font-semibold text-foreground">{v.leads?.customer_name ?? 'Unknown'}</div>
          {v.leads?.mobile && v.leads.id && (
            <LeadCallLink
              leadId={v.leads.id}
              mobile={v.leads.mobile}
              className="text-xs font-medium text-primary hover:underline"
            >
              {v.leads.mobile}
            </LeadCallLink>
          )}
        </div>
      ),
    },
    {
      id: 'location',
      header: 'Area',
      mobile: 'meta',
      hideBelow: 'lg',
      cell: (v) => (
        <span className="text-xs text-muted-foreground">
          {[v.leads?.village_city, v.leads?.district].filter(Boolean).join(', ') || '—'}
        </span>
      ),
    },
    {
      id: 'when',
      header: 'Scheduled',
      mobile: 'meta',
      sortKey: 'scheduled_for',
      cell: (v) => {
        if (!v.scheduled_for) return <span className="text-muted-foreground/60">—</span>;
        const overdue = v.visit_status === 'scheduled' && isPast(new Date(v.scheduled_for));
        return (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className={overdue ? 'font-semibold text-destructive' : ''}>
              {format(new Date(v.scheduled_for), 'dd MMM, h:mm a')}
            </span>
            {overdue && <StatusBadge value="overdue" map={overdueMap} size="sm" />}
          </div>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      mobile: 'badge',
      cell: (v) =>
        v.visit_status === 'scheduled' ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning">
            <Clock className="h-3.5 w-3.5" /> Pending
          </span>
        ) : v.visit_status === 'cancelled' ? (
          <span className="text-xs text-muted-foreground">Cancelled</span>
        ) : (
          <span className="text-xs text-foreground">{outcomeLabel(v.outcome)}</span>
        ),
    },
  ];

  const views = [
    { value: 'today', label: "Today's visits", count: counts?.today },
    { value: 'due', label: 'Due visits', count: counts?.due },
    { value: 'all', label: 'All assigned', count: counts?.all },
  ];

  const tile = (value: MyVisitScope) =>
    cn(scope === value && 'ring-2 ring-primary/60');

  return (
    <PageContainer>
      <PageHeader title="Sales Dashboard" icon={LayoutDashboard} />

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          title="Today's visits"
          value={counts?.today ?? '—'}
          icon={CalendarCheck}
          onClick={() => setScope('today')}
          className={tile('today')}
        />
        <StatCard
          title="Total assigned"
          value={counts?.all ?? '—'}
          icon={ListChecks}
          accent="info"
          onClick={() => setScope('all')}
          className={tile('all')}
        />
        <StatCard
          title="Due visits"
          value={counts?.due ?? '—'}
          icon={AlertTriangle}
          accent="destructive"
          change={counts ? (counts.due > 0 ? 'Action needed' : 'All clear') : undefined}
          changeType={counts && counts.due > 0 ? 'down' : 'neutral'}
          onClick={() => setScope('due')}
          className={tile('due')}
        />
      </div>

      <TableToolbar
        table={table}
        searchPlaceholder="Search by K-Number, customer name or mobile…"
        views={views}
        activeView={scope}
        onViewChange={(v) => setScope(v as MyVisitScope)}
        viewsLabel="Filter visits"
        layout={view}
        onLayoutChange={setView}
        filterFields={filterFields}
        conditions={conditions}
        onConditionsChange={setConditions}
      />

      <DataTable
        layout={view}
        table={table}
        filtered={countApplied(conditions, filterFields) > 0}
        columns={columns}
        rowKey={(v) => v.id}
        onRowClick={(v) => navigate(`/visits/${v.id}`)}
        emptyTitle={emptyCopy[scope].title}
        emptyDescription={emptyCopy[scope].description}
        emptyIcon={scope === 'all' ? CalendarClock : MapPin}
      />

      <TablePagination table={table} entityLabel="visits" />
    </PageContainer>
  );
};

export default SalesPersonDashboard;
