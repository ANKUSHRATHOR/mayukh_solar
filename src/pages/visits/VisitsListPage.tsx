import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, isPast } from 'date-fns';
import { CalendarClock, CheckCircle2, Clock, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import DataTable, { type DataTableColumn } from '@/components/common/DataTable';
import TableToolbar from '@/components/common/TableToolbar';
import TablePagination from '@/components/common/TablePagination';
import { useServerTable } from '@/hooks/useServerTable';
import { defaultSort } from '@/lib/tableQuery';
import {
  VISIT_OUTCOMES,
  fetchVisitTabCounts,
  fetchVisitsPage,
  type VisitTab,
  type VisitWithLead,
} from '@/lib/visits';

const outcomeLabel = (value: string | null) =>
  VISIT_OUTCOMES.find((o) => o.value === value)?.label ?? value ?? '—';

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
              <Badge className="border-transparent bg-destructive/15 px-1.5 py-0 text-[9px] font-bold uppercase text-destructive">
                Overdue
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      id: 'outcome',
      header: tab === 'open' ? 'Status' : 'Outcome',
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as VisitTab)}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="gap-2 text-xs sm:text-sm">
              {t.value === 'open' ? (
                <Clock className="h-3.5 w-3.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {t.label}
              {typeof t.count === 'number' && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                  {t.count}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <TableToolbar
        table={table}
        searchPlaceholder="Search by K-Number, customer name or mobile…"
      />

      <DataTable
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
