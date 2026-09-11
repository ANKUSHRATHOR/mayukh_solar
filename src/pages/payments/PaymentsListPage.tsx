import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Download,
  IndianRupee,
  Inbox,
  Landmark,
  Plus,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import DataTable, { type DataTableColumn } from '@/components/common/DataTable';
import TableToolbar from '@/components/common/TableToolbar';
import { defaultTableView, type TableView } from '@/components/common/ViewToggle';
import TablePagination from '@/components/common/TablePagination';
import StatusBadge from '@/components/common/StatusBadge';
import StatStrip from '@/components/common/StatStrip';
import PaymentFormDialog from '@/components/payments/PaymentFormDialog';
import { useServerTable } from '@/hooks/useServerTable';
import { useStickyState } from '@/hooks/useStickyState';
import { useAuth } from '@/contexts/AuthContext';
import { defaultSort } from '@/lib/tableQuery';
import { canAddPayment } from '@/lib/capabilities';
import { downloadCsv } from '@/lib/exportCsv';
import { formatMoney, paymentModeLabels } from '@/lib/payments';
import {
  fetchDuesPage,
  fetchPaymentKpis,
  fetchPaymentsPage,
  isPaymentTab,
  PAYMENT_MODES,
  type DueRow,
  type PaymentMode,
  type PaymentRow,
  type PaymentTab,
} from '@/lib/paymentsData';

/**
 * Every rupee that has come in, across every project.
 *
 * Four buckets, because a payment can be in one of four situations and each
 * needs a different action:
 *   All          — the ledger.
 *   Unallocated  — money logged before anyone knew the project. An inbox: the
 *                  badge count is the point, it should be worked down to zero.
 *   Dues         — projects whose plant is live and whose balance is not.
 *   General      — income deliberately marked as belonging to no project.
 */
const PaymentsListPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role } = useAuth();
  // Was `const isAdmin = role === 'admin'` — declared, never referenced, so
  // both "Add payment" buttons rendered for every role that could reach the
  // page. project_payments takes inserts from admin, operator and sales only.
  const canAdd = canAddPayment(role);

  // Tab and filters live in the URL so a KPI tile can point at a filtered list
  // and the back button steps between them. Validated on read: an unvalidated
  // ?mode=foo reaches .eq('payment_mode','foo') and PostgREST 400s.
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: PaymentTab = isPaymentTab(rawTab) ? rawTab : 'all';
  const rawMode = searchParams.get('mode');
  const mode = PAYMENT_MODES.includes(rawMode as PaymentMode) ? (rawMode as PaymentMode) : '';

  const setParams = (next: { tab?: PaymentTab; mode?: string }) => {
    const params = new URLSearchParams(searchParams);
    const nextTab = next.tab ?? tab;
    const nextMode = next.mode ?? mode;
    if (nextTab === 'all') params.delete('tab');
    else params.set('tab', nextTab);
    if (!nextMode) params.delete('mode');
    else params.set('mode', nextMode);
    setSearchParams(params, { replace: true });
  };
  const setTab = (value: PaymentTab) => setParams({ tab: value });
  const setMode = (value: string) => setParams({ mode: value });

  // The list only ever creates; editing, assigning and deleting live on the
  // payment's own page, so there is one place that owns them.
  const [formOpen, setFormOpen] = useState(false);

  // A ledger is read by comparing rows, which a table does and stacked cards do
  // not, so this list opens as a table. Sticky, like sort and page size.
  //
  // `table` rather than `auto`: auto swaps to cards below md, so on a 758px
  // window — a perfectly ordinary laptop width — picking "Table" did nothing at
  // all. An explicit choice has to be honoured at every width; a narrow table
  // scrolls sideways inside its own container instead.
  //
  // The *initial* value is width-aware, but only until the reader chooses: a
  // sales person opening this on a phone should get the card fallback the design
  // system asks for, not a table to drag sideways. Once they pick, the choice
  // sticks at every width.
  const [view, setView] = useStickyState<TableView>('payments-list:view', defaultTableView());
  const layout = view === 'cards' ? 'cards' : 'table';

  const showDues = tab === 'dues';

  const filters = useMemo(() => ({ tab, mode: mode || undefined }), [tab, mode]);

  const payments = useServerTable<PaymentRow>({
    queryKey: ['payments', 'list'],
    fetchPage: fetchPaymentsPage,
    initialSort: defaultSort('payment_date', 'desc'),
    filters,
    persistKey: 'payments-list',
    enabled: !showDues,
  });

  const dues = useServerTable<DueRow>({
    queryKey: ['payments', 'dues'],
    fetchPage: fetchDuesPage,
    initialSort: defaultSort('net_meter_installed_at', 'asc'),
    filters: useMemo(() => ({}), []),
    persistKey: 'payments-dues',
    enabled: showDues,
  });

  const kpiQuery = useQuery({ queryKey: ['payments', 'kpis'], queryFn: fetchPaymentKpis });
  const kpis = kpiQuery.data;

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  };

  const openNew = () => setFormOpen(true);

  const customerCell = (row: { k_number: string | null; customer_name: string | null; mobile: string | null }) => {
    if (!row.k_number && !row.customer_name) {
      return <span className="text-xs italic text-muted-foreground">No project linked</span>;
    }
    return (
      <div className="min-w-0">
        {row.k_number && (
          <div className="font-mono text-xs font-bold text-foreground">{row.k_number}</div>
        )}
        <div className="truncate text-xs text-muted-foreground">{row.customer_name}</div>
      </div>
    );
  };

  const paymentColumns: DataTableColumn<PaymentRow>[] = [
    {
      id: 'amount',
      header: 'Amount',
      sortKey: 'amount',
      mobile: 'title',
      cell: (p) => (
        <span className="font-bold tabular-nums text-foreground">{formatMoney(p.amount)}</span>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      mobile: 'subtitle',
      cell: (p) =>
        p.project_id ? (
          customerCell(p)
        ) : (
          <span className="text-xs text-muted-foreground">
            {p.payer_name || (p.no_project_needed ? 'General income' : 'Not linked yet')}
          </span>
        ),
    },
    {
      id: 'payment_date',
      header: 'Received',
      sortKey: 'payment_date',
      mobile: 'meta',
      cell: (p) => (
        <span className="whitespace-nowrap text-xs">
          {format(new Date(p.payment_date), 'dd MMM yyyy')}
        </span>
      ),
    },
    {
      id: 'payment_mode',
      header: 'Mode',
      sortKey: 'payment_mode',
      mobile: 'meta',
      cell: (p) => (
        <span className="text-xs font-medium">
          {paymentModeLabels[p.payment_mode] ?? p.payment_mode}
        </span>
      ),
    },
    {
      id: 'source',
      header: 'Paid by',
      sortKey: 'source',
      hideBelow: 'lg',
      mobile: 'meta',
      cell: (p) => (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
          {p.source === 'bank' ? (
            <>
              <Landmark className="h-3.5 w-3.5 text-muted-foreground" /> Bank
            </>
          ) : (
            <>
              <Wallet className="h-3.5 w-3.5 text-muted-foreground" /> Customer
            </>
          )}
        </span>
      ),
    },
    {
      id: 'reference_number',
      header: 'Reference',
      hideBelow: 'xl',
      mobile: 'hidden',
      cell: (p) => (
        <span className="break-all text-xs text-muted-foreground">{p.reference_number || '—'}</span>
      ),
    },
  ];

  const dueColumns: DataTableColumn<DueRow>[] = [
    {
      id: 'customer',
      header: 'Customer',
      sortKey: 'k_number',
      mobile: 'title',
      cell: customerCell,
    },
    {
      id: 'balance',
      header: 'Outstanding',
      sortKey: 'balance',
      align: 'right',
      mobile: 'meta',
      cell: (d) => (
        <span className="font-bold tabular-nums text-warning">{formatMoney(d.balance)}</span>
      ),
    },
    {
      id: 'received',
      header: 'Received',
      sortKey: 'received',
      align: 'right',
      hideBelow: 'lg',
      cell: (d) => <span className="tabular-nums">{formatMoney(d.received)}</span>,
    },
    {
      id: 'final_amount',
      header: 'Total',
      sortKey: 'final_amount',
      align: 'right',
      hideBelow: 'lg',
      cell: (d) => <span className="tabular-nums">{formatMoney(d.final_amount)}</span>,
    },
    {
      id: 'net_meter_installed_at',
      header: 'Live since',
      sortKey: 'net_meter_installed_at',
      cell: (d) => (
        <span className="whitespace-nowrap text-xs">
          {format(new Date(d.net_meter_installed_at), 'dd MMM yyyy')}
        </span>
      ),
    },
    {
      id: 'is_overdue',
      header: 'Status',
      sortKey: 'is_overdue',
      mobile: 'badge',
      cell: (d) =>
        // StatusBadge, not a hand-rolled Badge: these were text-xs sentence
        // case while every other status chip in the app is text-[10px] upper.
        <StatusBadge
          value={d.is_overdue ? 'overdue' : 'in_window'}
          map={{
            overdue: {
              label: `${d.days_overdue} day${d.days_overdue === 1 ? '' : 's'} late`,
              tone: 'danger',
            },
            in_window: { label: 'In window', tone: 'neutral' },
          }}
          size="sm"
        />,
    },
  ];

  const exportCurrentPage = () =>
    showDues
      ? downloadCsv(
          'payment-dues.csv',
          [
            { header: 'K-Number', value: (d: DueRow) => d.k_number ?? '' },
            { header: 'Customer', value: (d: DueRow) => d.customer_name ?? '' },
            { header: 'Mobile', value: (d: DueRow) => d.mobile ?? '' },
            { header: 'Total (INR)', value: (d: DueRow) => d.final_amount },
            { header: 'Received (INR)', value: (d: DueRow) => d.received },
            { header: 'Outstanding (INR)', value: (d: DueRow) => d.balance },
            { header: 'Live since', value: (d: DueRow) => d.net_meter_installed_at },
            { header: 'Days overdue', value: (d: DueRow) => (d.is_overdue ? d.days_overdue : 0) },
          ],
          dues.rows
        )
      : downloadCsv(
          `payments-${tab}.csv`,
          [
            { header: 'Date', value: (p: PaymentRow) => p.payment_date },
            { header: 'Amount (INR)', value: (p: PaymentRow) => p.amount },
            { header: 'K-Number', value: (p: PaymentRow) => p.k_number ?? '' },
            { header: 'Customer', value: (p: PaymentRow) => p.customer_name ?? '' },
            { header: 'Mobile', value: (p: PaymentRow) => p.mobile ?? '' },
            { header: 'Paid by', value: (p: PaymentRow) => p.payer_name ?? p.source },
            { header: 'Mode', value: (p: PaymentRow) => p.payment_mode },
            { header: 'Reference', value: (p: PaymentRow) => p.reference_number ?? '' },
            { header: 'Allocation', value: (p: PaymentRow) => p.allocation },
            { header: 'Status', value: (p: PaymentRow) => p.status },
          ],
          payments.rows
        );

  const tabs: { value: PaymentTab; label: string; count?: number }[] = [
    { value: 'all', label: 'All payments' },
    { value: 'unallocated', label: 'Unallocated', count: kpis?.unallocated_count },
    { value: 'dues', label: 'Dues', count: kpis?.overdue_count },
    { value: 'general', label: 'General' },
  ];

  const activeTable = showDues ? dues : payments;

  return (
    <PageContainer>
      <PageHeader
        title="Payments"
        icon={IndianRupee}
        actions={
          // The label on the secondary action goes below sm rather than the whole
          // pair going full-width: the primary keeps its words, and the header
          // stays one row beside the title.
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-10 gap-2 px-2.5 sm:h-9 sm:px-3"
              onClick={exportCurrentPage}
              disabled={activeTable.rows.length === 0}
              aria-label="Export this page"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>
            {canAdd && (
              <Button size="sm" className="h-10 gap-2 sm:h-9" onClick={openNew}>
                <Plus className="h-4 w-4" /> Add payment
              </Button>
            )}
          </div>
        }
      />

      {/* The same compact strip every list uses. Absent, not zeroed, for a role
          that cannot read project_payments — "Outstanding ₹0" would read as
          "nothing is owed" rather than "you cannot see this". */}
      {kpis?.payments_visible && (
        <StatStrip
          items={[
            { label: 'This month', value: formatMoney(kpis.received_this_month), tone: 'success' },
            {
              label: 'Outstanding',
              value: formatMoney(kpis.outstanding),
              tone: 'warning',
              onClick: () => setTab('dues'),
            },
            {
              label: 'Overdue',
              value: formatMoney(kpis.overdue_amount),
              tone: 'danger',
              hint:
                kpis.overdue_count > 0
                  ? `${kpis.overdue_count} past ${kpis.due_days}d`
                  : 'nothing late',
              onClick: () => setTab('dues'),
            },
            {
              label: 'Unallocated',
              value: kpis.unallocated_count,
              tone: kpis.unallocated_count > 0 ? 'info' : 'neutral',
              hint:
                kpis.unallocated_count > 0
                  ? `${formatMoney(kpis.unallocated_amount)} to match`
                  : 'inbox clear',
              onClick: () => setTab('unallocated'),
            },
          ]}
        />
      )}

      {showDues ? (
        <>
          <TableToolbar
            table={dues}
            searchPlaceholder="Search by K-Number, customer name or mobile…"
            views={tabs}
            activeView={tab}
            onViewChange={(v) => setTab(v as PaymentTab)}
            viewsLabel="Filter payments"
            layout={view}
            onLayoutChange={setView}
          />
          <DataTable
            layout={layout}
            table={dues}
            columns={dueColumns}
            rowKey={(d) => d.project_id}
            onRowClick={(d) => navigate(`/projects/${d.project_id}?tab=payments`)}
            emptyTitle="Nothing outstanding"
            emptyDescription="Every project whose plant is live has been paid in full."
            emptyIcon={Wallet}
          />
          <TablePagination table={dues} entityLabel="projects" />
        </>
      ) : (
        <>
          <TableToolbar
            table={payments}
            searchPlaceholder="Search by K-Number, name, mobile or reference…"
            activeFilterCount={mode ? 1 : 0}
            onClearFilters={() => setMode('')}
            views={tabs}
            activeView={tab}
            onViewChange={(v) => setTab(v as PaymentTab)}
            viewsLabel="Filter payments"
            layout={view}
            onLayoutChange={setView}
            filters={
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Mode</Label>
                <Select value={mode || 'all'} onValueChange={(v) => setMode(v === 'all' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Any mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any mode</SelectItem>
                    {PAYMENT_MODES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {paymentModeLabels[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            }
          />
          <DataTable
            layout={layout}
            table={payments}
            columns={paymentColumns}
            rowKey={(p) => p.id}
            onRowClick={(p) => navigate(`/payments/${p.id}`)}
            emptyTitle={
              tab === 'unallocated'
                ? 'Inbox clear'
                : tab === 'general'
                  ? 'No general income'
                  : 'No payments yet'
            }
            emptyDescription={
              tab === 'unallocated'
                ? 'Every payment is matched to a project or marked as general income.'
                : 'Record money as it arrives — with or without a project.'
            }
            emptyIcon={tab === 'unallocated' ? Inbox : Wallet}
            emptyAction={
              canAdd && tab !== 'unallocated' ? (
                <Button size="sm" className="gap-1.5" onClick={openNew}>
                  <Plus className="h-4 w-4" /> Add payment
                </Button>
              ) : undefined
            }
          />
          <TablePagination table={payments} entityLabel="payments" />
        </>
      )}

      <PaymentFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={refreshAll} />
    </PageContainer>
  );
};

export default PaymentsListPage;
