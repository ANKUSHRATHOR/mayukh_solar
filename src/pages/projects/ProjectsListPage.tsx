import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Briefcase, CheckCircle2, Download, FileText, IndianRupee, Landmark, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import DataTable, { type DataTableColumn } from '@/components/common/DataTable';
import TableToolbar from '@/components/common/TableToolbar';
import { defaultTableView, type TableView } from '@/components/common/ViewToggle';
import { useStickyState } from '@/hooks/useStickyState';
import TablePagination from '@/components/common/TablePagination';
import StatusBadge from '@/components/common/StatusBadge';
import { useServerTable } from '@/hooks/useServerTable';
import { defaultSort } from '@/lib/tableQuery';
import { downloadCsv } from '@/lib/exportCsv';
import { allProjectStageMeta, PROJECT_STAGES } from '@/lib/projectStages';
import {
  fetchProjectKpis,
  fetchProjectTabCounts,
  fetchProjectsPage,
  projectIdentity,
  PROJECT_FILTER_FIELDS,
  type ProjectRow,
  type ProjectTab,
} from '@/lib/projects';
import { formatMoney, involvesLoan, paymentTypeLabel, paymentTypeLabels } from '@/lib/payments';
import { countApplied, newConditionId, type FilterCondition, type FilterField } from '@/lib/filterConditions';
import { useStaffNames } from '@/hooks/useStaffNames';
import { useAuth } from '@/contexts/AuthContext';
import StatStrip, { type StatItem } from '@/components/common/StatStrip';
import { useFieldSuggestions } from '@/hooks/useFieldSuggestions';

interface Props {
  /**
   * Rendered inside the Admin Dashboard's Projects tab, which supplies its own
   * page chrome — same convention as AdminLeadsList and Tasks.
   */
  isEmbedded?: boolean;
}

const ProjectsListPage = ({ isEmbedded = false }: Props) => {
  const navigate = useNavigate();
  const { role } = useAuth();

  // The payment-type tab lives in the URL so a link or bookmark can point at
  // it, and the back button steps between them. ?stage= is still accepted as a
  // link target and converted to a condition below.
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useStickyState<TableView>('projects-list:view', defaultTableView());
  const rawTab = searchParams.get('tab');
  const tab: ProjectTab =
    rawTab === 'cash' || rawTab === 'loan' ? rawTab : 'all';
  const setTab = (value: ProjectTab) => {
    const params = new URLSearchParams(searchParams);
    if (value === 'all') params.delete('tab');
    else params.set('tab', value);
    setSearchParams(params, { replace: true });
  };

  const [conditions, setConditions] = useStickyState<FilterCondition[]>('projects-list:conditions', []);

  // A stage shortcut — a strip figure here, or a dashboard tile linking to
  // ?stage= — becomes a "Stage is …" condition, so it shows in the Filters
  // popover and can be edited or removed there like any other.
  const setStage = (value: string) =>
    setConditions((prev) => [
      ...prev.filter((c) => c.field !== 'status'),
      ...(value ? [{ id: newConditionId(), field: 'status', op: 'is' as const, value }] : []),
    ]);

  const rawStage = searchParams.get('stage');
  useEffect(() => {
    if (rawStage === null) return;
    // Validated: an unknown stage would reach PostgREST as a bad enum cast.
    if (PROJECT_STAGES.some((s) => s.stage === rawStage)) setStage(rawStage);
    const params = new URLSearchParams(searchParams);
    params.delete('stage');
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawStage]);

  const { staff } = useStaffNames();
  const filterFields = useMemo<FilterField<never>[]>(() => {
    const people = Array.from(staff?.values() ?? [])
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
      .map((p) => ({ value: p.user_id, label: p.full_name }));
    const options: Record<string, FilterField<never>['options']> = {
      status: PROJECT_STAGES.map((s) => ({ value: s.stage, label: s.label })),
      payment_type: Object.entries(paymentTypeLabels).map(([value, label]) => ({ value, label })),
      assigned_sales_person_id: people,
      assigned_operator_id: people,
      assigned_welder_id: people,
      assigned_electrician_id: people,
    };
    return PROJECT_FILTER_FIELDS.map((f) => (options[f.key] ? { ...f, options: options[f.key] } : f));
  }, [staff]);
  const pickerFields = useFieldSuggestions(filterFields);

  const filters = useMemo(() => ({ tab, conditions }), [tab, conditions]);

  const table = useServerTable<ProjectRow>({
    queryKey: ['projects', 'list'],
    fetchPage: fetchProjectsPage,
    initialSort: defaultSort('created_at', 'desc'),
    filters,
    persistKey: 'projects-list',
  });

  const { data: counts } = useQuery({
    queryKey: ['projects', 'tab-counts'],
    queryFn: fetchProjectTabCounts,
  });

  // One RPC for all six tiles. Six more head counts on top of the page query is
  // the shape that blew the statement timeout on the leads screen — see
  // supabase/migrations/20260802000000_leads_stage_counts.sql.
  const kpiQuery = useQuery({
    queryKey: ['projects', 'kpis', tab, table.search],
    queryFn: () => fetchProjectKpis(tab, table.search),
  });
  const kpis = kpiQuery.data;

  const columns: DataTableColumn<ProjectRow>[] = [
    {
      id: 'k_number',
      header: 'K-Number',
      sortKey: 'k_number',
      mobile: 'title',
      cell: (p) => {
        const { kNumber } = projectIdentity(p);
        return kNumber ? (
          <span className="font-mono text-xs font-bold text-foreground">{kNumber}</span>
        ) : (
          <span className="text-xs text-muted-foreground/60">Not linked</span>
        );
      },
    },
    {
      id: 'customer',
      header: 'Customer',
      mobile: 'subtitle',
      cell: (p) => {
        const { name, mobile } = projectIdentity(p);
        return (
          <div className="min-w-0">
            <div className="truncate font-semibold text-foreground">{name}</div>
            {mobile && (
              <a
                href={`tel:${mobile}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-medium text-primary hover:underline"
              >
                {mobile}
              </a>
            )}
          </div>
        );
      },
    },
    {
      id: 'status',
      header: 'Stage',
      sortKey: 'status',
      mobile: 'badge',
      cell: (p) => <StatusBadge value={p.status} map={allProjectStageMeta} size="sm" />,
    },
    {
      id: 'payment_type',
      header: 'Type',
      sortKey: 'payment_type',
      mobile: 'meta',
      cell: (p) => (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
          {involvesLoan(p.payment_type) ? (
            <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {paymentTypeLabel(p.payment_type)}
        </span>
      ),
    },
    {
      id: 'capacity_kw',
      header: 'Capacity',
      sortKey: 'capacity_kw',
      align: 'right',
      hideBelow: 'lg',
      mobile: 'meta',
      cell: (p) => <span className="tabular-nums">{p.capacity_kw} kW</span>,
    },
    {
      id: 'final_amount',
      header: 'Value',
      sortKey: 'final_amount',
      align: 'right',
      mobile: 'meta',
      cell: (p) => (
        <span className="font-bold tabular-nums text-foreground">
          {formatMoney(p.final_amount)}
        </span>
      ),
    },
  ];

  const exportCurrentPage = () =>
    downloadCsv(
      `projects-${tab}.csv`,
      [
        { header: 'K-Number', value: (p: ProjectRow) => projectIdentity(p).kNumber ?? '' },
        { header: 'Customer', value: (p: ProjectRow) => projectIdentity(p).name },
        { header: 'Mobile', value: (p: ProjectRow) => projectIdentity(p).mobile ?? '' },
        { header: 'Stage', value: (p: ProjectRow) => allProjectStageMeta[p.status]?.label ?? p.status },
        { header: 'Type', value: (p: ProjectRow) => p.payment_type },
        { header: 'Bank', value: (p: ProjectRow) => p.loan_bank ?? '' },
        { header: 'Capacity kW', value: (p: ProjectRow) => p.capacity_kw },
        { header: 'Value (INR)', value: (p: ProjectRow) => p.final_amount },
      ],
      table.rows
    );

  const tabs: { value: ProjectTab; label: string; count?: number }[] = [
    { value: 'all', label: 'All Projects', count: counts?.all },
    { value: 'cash', label: 'Cash Projects', count: counts?.cash },
    { value: 'loan', label: 'Loan Projects', count: counts?.loan },
  ];

  const Shell = isEmbedded
    ? ({ children }: { children: React.ReactNode }) => (
        <div className="space-y-5">{children}</div>
      )
    : PageContainer;

  return (
    <Shell>
      {!isEmbedded && (
        <PageHeader
          title="Projects"
          icon={Briefcase}
          actions={
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={exportCurrentPage}
              disabled={table.rows.length === 0}
            >
              <Download className="h-4 w-4" /> Export page
            </Button>
          }
        />
      )}

      {/* One compact strip, not six bordered tiles. The grid put 509px of
          chrome above the first project on a 1400px screen, and because the
          money tiles are role-dependent it rendered 4, 5 or 6 cards into a
          4-column grid — a stranded last row whenever the count was odd.
          Still clickable filters, same as before. */}
      {kpis && (
        <StatStrip
          items={[
            { label: 'Active', value: kpis.active, onClick: () => setStage('') },
            {
              label: 'Awaiting docs',
              value: kpis.awaiting_documents,
              tone: 'warning',
              onClick: () => setStage('documents_pending'),
            },
            {
              label: 'Completed',
              value: kpis.completed_this_month,
              tone: 'success',
              hint: 'this month',
              onClick: () => setStage('project_completed'),
            },
            // Payment-derived: absent, not zero, for roles that cannot read
            // project_payments — a wrong number here is worse than none.
            ...(kpis.payments_visible && kpis.blocked !== null
              ? ([{
                  label: 'Blocked on bank',
                  value: kpis.blocked,
                  tone: 'danger',
                  hint: kpis.blocked > 0 ? 'awaiting first instalment' : 'none waiting',
                  onClick: () => {
                    setTab('loan');
                    setStage('');
                  },
                }] as StatItem[])
              : []),
            { label: 'Total value', value: formatMoney(kpis.total_value) },
            ...(kpis.payments_visible && kpis.balance_due !== null
              ? ([{ label: 'Balance due', value: formatMoney(kpis.balance_due), tone: 'warning' }] as StatItem[])
              : []),
          ]}
        />
      )}

      <TableToolbar
        table={table}
        searchPlaceholder="Search by K-Number, customer name or mobile…"
        views={tabs}
        activeView={tab}
        onViewChange={(v) => setTab(v as ProjectTab)}
        viewsLabel="Filter by payment type"
        layout={view}
        onLayoutChange={setView}
        filterFields={pickerFields}
        conditions={conditions}
        onConditionsChange={setConditions}
      />

      <DataTable
        layout={view}
        table={table}
        filtered={countApplied(conditions, filterFields) > 0}
        columns={columns}
        rowKey={(p) => p.id}
        onRowClick={(p) => navigate(`/projects/${p.id}`)}
        emptyTitle={
          tab === 'cash'
            ? 'No cash projects'
            : tab === 'loan'
              ? 'No loan projects'
              : 'No projects yet'
        }
        emptyDescription="Projects appear here once a deal is converted from an accepted quotation."
        emptyIcon={Briefcase}
      />

      <TablePagination table={table} entityLabel="projects" />
    </Shell>
  );
};

export default ProjectsListPage;
