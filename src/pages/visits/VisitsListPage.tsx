import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, isPast } from 'date-fns';
import { CalendarClock, Clock, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import DataTable, { type DataTableColumn } from '@/components/common/DataTable';
import TableToolbar from '@/components/common/TableToolbar';
import { type TableView } from '@/components/common/ViewToggle';
import { useStickyState } from '@/hooks/useStickyState';
import TablePagination from '@/components/common/TablePagination';
import StatusBadge from '@/components/common/StatusBadge';
import { useServerTable } from '@/hooks/useServerTable';
import { defaultSort } from '@/lib/tableQuery';
import {
  fetchVisitTabCounts,
  fetchVisitsPage,
  type VisitTab,
  type VisitWithLead,
  outcomeLabel,
} from '@/lib/visits';

/**
 * All site visits across every lead.
 *
 * Separate from the Leads list on purpose: a surveyor's working day is a list
 * of visits, not a list of leads, and they need the address and phone number
 * rather than the full sales cockpit.
 */
const VisitsListPage = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<VisitTab>('open');
  const [view, setView] = useStickyState<TableView>('visits-list:view', 'table');

  const filters = useMemo(() => ({ tab }), [tab]);

  const table = useServerTable<VisitWithLead>({
    queryKey: ['visits', 'list'],
    fetchPage: fetchVisitsPage,
    // Open visits read best soonest-first; completed reads best newest-first.
    initialSort: defaultSort('scheduled_for', 'asc'),
    filters,
    persistKey: 'visits-list',
  });

  const { data: counts } = useQuery({
    queryKey: ['visits', 'tab-counts'],
    queryFn: fetchVisitTabCounts,
  });

  const columns: DataTableColumn<VisitWithLead>[] = [
    {
      id: 'k_number',
      header: 'K-Number',
      mobile: 'title',
      cell: (v) =>
        v.leads?.k_number ? (
          <span className="font-mono text-xs font-bold text-foreground">
            {v.leads.k_number}
          </span>
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
          <div className="truncate font-semibold text-foreground">
            {v.leads?.customer_name ?? 'Unknown'}
          </div>
          {v.leads?.mobile && (
            <a
              href={`tel:${v.leads.mobile}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-medium text-primary hover:underline"
            >
              {v.leads.mobile}
            </a>
          )}
        </div>
      ),
    },
    {
      id: 'location',
      mobile: 'meta',
      header: 'Area',
      hideBelow: 'lg',
      cell: (v) => (
        <span className="text-xs text-muted-foreground">
          {[v.leads?.village_city, v.leads?.district].filter(Boolean).join(', ') || '—'}
        </span>
      ),
    },
    {
      id: 'when',
      mobile: 'meta',
      header: tab === 'open' ? 'Scheduled' : 'Completed',
      sortKey: tab === 'open' ? 'scheduled_for' : 'completed_at',
      cell: (v) => {
        const when = tab === 'open' ? v.scheduled_for : v.completed_at;
        if (!when) return <span className="text-muted-foreground/60">—</span>;
        const overdue = tab === 'open' && isPast(new Date(when));
        return (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className={overdue ? 'font-semibold text-destructive' : ''}>
              {format(new Date(when), 'dd MMM, h:mm a')}
            </span>
            {overdue && (
              <StatusBadge
                value="overdue"
                map={{ overdue: { label: 'Overdue', tone: 'danger' } }}
                size="sm"
              />
            )}
          </div>
        );
      },
    },
    {
      id: 'outcome',
      header: tab === 'open' ? 'Status' : 'Outcome',
      mobile: 'badge',
      cell: (v) =>
        tab === 'open' ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning">
            <Clock className="h-3.5 w-3.5" /> Pending
          </span>
        ) : (
          <span className="text-xs text-foreground">{outcomeLabel(v.outcome)}</span>
        ),
    },
  ];

  const tabs: { value: VisitTab; label: string; count?: number }[] = [
    { value: 'open', label: 'Open Visits', count: counts?.open },
    { value: 'completed', label: 'Completed', count: counts?.completed },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Site Visits"
        icon={CalendarClock}
      />

      <TableToolbar
        table={table}
        searchPlaceholder="Search by K-Number, customer name or mobile…"
        views={tabs}
        activeView={tab}
        onViewChange={(v) => setTab(v as VisitTab)}
        viewsLabel="Filter by visit state"
        layout={view}
        onLayoutChange={setView}
      />

      <DataTable
        layout={view}
        table={table}
        columns={columns}
        rowKey={(v) => v.id}
        onRowClick={(v) => navigate(`/visits/${v.id}`)}
        emptyTitle={tab === 'open' ? 'No open visits' : 'No completed visits yet'}
        emptyDescription={
          tab === 'open'
            ? 'Visits appear here once they are booked from a lead.'
            : 'Completed surveys will be listed here.'
        }
        emptyIcon={MapPin}
      />

      <TablePagination table={table} entityLabel="visits" />
    </PageContainer>
  );
};

export default VisitsListPage;
