import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import DataTable, { type DataTableColumn } from '@/components/common/DataTable';
import TableToolbar from '@/components/common/TableToolbar';
import TablePagination from '@/components/common/TablePagination';
import StatusBadge from '@/components/common/StatusBadge';
import ViewToggle, { defaultTableView, type TableView } from '@/components/common/ViewToggle';
import { useServerTable } from '@/hooks/useServerTable';
import { useStickyState } from '@/hooks/useStickyState';
import { downloadCsv } from '@/lib/exportCsv';
import { workKindMeta, workStatusMeta, type WorkKind } from '@/lib/performance';
import { workItemsPageFetcher, type WorkBucket, type WorkItem } from '@/lib/performanceData';
import { Download } from 'lucide-react';

interface WorkItemsPanelProps {
  from: string;
  to: string;
  role?: string | null;
  staff?: string | null;
  bucket: WorkBucket;
  /** Dropdown subsets. Omitted inside a drill-down, where the slice is the point. */
  onBucketChange?: (bucket: WorkBucket) => void;
  counts?: Partial<Record<WorkBucket, number>>;
  /** Compact mode for the drill-down dialog: no layout toggle, smaller page. */
  dense?: boolean;
}

const BUCKET_VIEWS: { value: WorkBucket; label: string }[] = [
  { value: 'assigned', label: 'Assigned in period' },
  { value: 'pending', label: 'Pending' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'completed', label: 'Completed' },
  { value: 'completed_in_period', label: 'Finished in period' },
  { value: 'due_today', label: 'Due today' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const BUCKET_LABELS: Record<WorkBucket, string> = {
  assigned: 'Work assigned in this period',
  pending: 'Pending work',
  overdue: 'Overdue work',
  completed: 'Completed work',
  completed_in_period: 'Work finished in this period',
  due_today: 'Due today',
  cancelled: 'Cancelled work',
  all: 'All work',
};

const priorityMeta = {
  urgent: { label: 'Urgent', tone: 'danger' as const },
  high: { label: 'High', tone: 'warning' as const },
  medium: { label: 'Medium', tone: 'info' as const },
  low: { label: 'Low', tone: 'neutral' as const },
};

const kindMeta = {
  task: { label: 'Task', tone: 'info' as const },
  visit: { label: 'Visit', tone: 'progress' as const },
  lead: { label: 'Lead', tone: 'neutral' as const },
  project: { label: 'Project', tone: 'success' as const },
};

const shortDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';

/**
 * The assigned work and tasks table — and, with a different `bucket`, every
 * drill-down in the module.
 *
 * It is one component on purpose. The tiles count rows in
 * `performance_work_items_v`; this reads the same view through the same
 * function with the same bucket predicate, so "12 overdue" opens twelve rows.
 * A second query written to "show the overdue ones" is exactly how a dashboard
 * and its detail stop agreeing.
 */
const WorkItemsPanel = ({
  from,
  to,
  role,
  staff,
  bucket,
  onBucketChange,
  counts,
  dense = false,
}: WorkItemsPanelProps) => {
  const navigate = useNavigate();
  const [kind, setKind] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [priority, setPriority] = useState<string>('all');
  const [view, setView] = useStickyState<TableView>('performance-work:view', defaultTableView());

  const filters = useMemo(
    () => ({
      kind: kind === 'all' ? null : kind,
      status: status === 'all' ? null : status,
      priority: priority === 'all' ? null : priority,
    }),
    [kind, status, priority]
  );

  const table = useServerTable<WorkItem>({
    queryKey: ['performance-work-items', from, to, role ?? 'all', staff ?? 'all', bucket],
    fetchPage: workItemsPageFetcher({ from, to, role, staff, bucket }),
    initialSort: { column: 'due_date', direction: 'asc' },
    pageSize: dense ? 10 : 25,
    persistKey: dense ? undefined : 'performance-work',
    filters,
  });

  const activeFilterCount = [kind, status, priority].filter((v) => v !== 'all').length;

  const columns: DataTableColumn<WorkItem>[] = [
    {
      id: 'title',
      header: 'Work',
      sortKey: 'title',
      mobile: 'title',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{row.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {workKindMeta[row.kind as WorkKind]?.label ?? row.kind} · {row.subject}
          </p>
        </div>
      ),
    },
    {
      id: 'kind',
      header: 'Type',
      hideBelow: 'lg',
      mobile: 'hidden',
      cell: (row) => <StatusBadge value={row.kind} map={kindMeta} size="sm" />,
    },
    {
      id: 'owner',
      header: 'Assigned to',
      sortKey: 'owner_name',
      mobile: 'subtitle',
      cell: (row) => <span className="truncate text-sm">{row.owner_name}</span>,
    },
    {
      id: 'assigned_at',
      header: 'Assigned',
      sortKey: 'assigned_at',
      hideBelow: 'xl',
      mobile: 'hidden',
      cell: (row) => <span className="text-xs tabular-nums">{shortDate(row.assigned_at)}</span>,
    },
    {
      id: 'due_date',
      header: 'Due',
      sortKey: 'due_date',
      mobile: 'meta',
      cell: (row) => (
        <span
          className={
            row.status === 'overdue'
              ? 'text-xs font-semibold tabular-nums text-destructive'
              : 'text-xs tabular-nums'
          }
        >
          {row.due_date ? shortDate(row.due_date) : 'No due date'}
        </span>
      ),
    },
    {
      id: 'priority',
      header: 'Priority',
      sortKey: 'priority',
      hideBelow: 'lg',
      mobile: 'meta',
      cell: (row) =>
        row.priority ? (
          <StatusBadge value={row.priority} map={priorityMeta} size="sm" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: 'status',
      header: 'Status',
      sortKey: 'status',
      mobile: 'badge',
      cell: (row) => <StatusBadge value={row.status} map={workStatusMeta} size="sm" />,
    },
    {
      id: 'completed_at',
      header: 'Completed',
      sortKey: 'completed_at',
      hideBelow: 'xl',
      mobile: 'hidden',
      cell: (row) => <span className="text-xs tabular-nums">{shortDate(row.completed_at)}</span>,
    },
    {
      id: 'outcome',
      header: 'Outcome',
      hideBelow: 'xl',
      mobile: 'hidden',
      cell: (row) => (
        <span className="truncate text-xs capitalize text-muted-foreground">
          {row.outcome ? row.outcome.replace(/_/g, ' ') : '—'}
        </span>
      ),
    },
  ];

  /**
   * Where a row opens. Every destination is an existing route behind its own
   * permission gate, so this adds no access: a reader who cannot open the lead
   * still cannot, they simply arrive at the gate.
   */
  const open = (row: WorkItem) => {
    if (row.kind === 'visit') navigate(`/visits/${row.item_id}`);
    else if (row.kind === 'project' || row.project_id) navigate(`/projects/${row.project_id ?? row.item_id}`);
    else if (row.lead_id) navigate(`/leads/${row.lead_id}`);
    else navigate('/tasks');
  };

  const exportCsv = () =>
    downloadCsv(`performance-work-${bucket}-${from}_${to}.csv`, [
      { header: 'Type', value: (r: WorkItem) => workKindMeta[r.kind as WorkKind]?.label ?? r.kind },
      { header: 'Work', value: (r: WorkItem) => r.title },
      { header: 'Related to', value: (r: WorkItem) => r.subject },
      { header: 'Assigned to', value: (r: WorkItem) => r.owner_name },
      { header: 'Assigned', value: (r: WorkItem) => r.assigned_at?.slice(0, 10) ?? '' },
      { header: 'Due', value: (r: WorkItem) => r.due_date ?? '' },
      { header: 'Priority', value: (r: WorkItem) => r.priority ?? '' },
      { header: 'Status', value: (r: WorkItem) => workStatusMeta[r.status as keyof typeof workStatusMeta]?.label ?? r.status },
      { header: 'Completed', value: (r: WorkItem) => r.completed_at?.slice(0, 10) ?? '' },
      { header: 'Outcome', value: (r: WorkItem) => r.outcome ?? '' },
    ], table.rows);

  return (
    <div className="space-y-2.5">
      <TableToolbar
        table={table}
        searchPlaceholder="Search work, lead or customer…"
        views={
          onBucketChange
            ? BUCKET_VIEWS.map((v) => ({ ...v, count: counts?.[v.value] }))
            : undefined
        }
        activeView={onBucketChange ? bucket : undefined}
        onViewChange={onBucketChange ? (v) => onBucketChange(v as WorkBucket) : undefined}
        viewsLabel="Work subset"
        layout={dense ? undefined : view}
        onLayoutChange={dense ? undefined : setView}
        activeFilterCount={activeFilterCount}
        onClearFilters={() => {
          setKind('all');
          setStatus('all');
          setPriority('all');
        }}
        filters={
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Type</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Every type</SelectItem>
                  {(Object.keys(workKindMeta) as WorkKind[]).map((k) => (
                    <SelectItem key={k} value={k}>{workKindMeta[k].plural}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Every status</SelectItem>
                  {(Object.keys(workStatusMeta) as (keyof typeof workStatusMeta)[]).map((s) => (
                    <SelectItem key={s} value={s}>{workStatusMeta[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any priority</SelectItem>
                  {Object.entries(priorityMeta).map(([value, meta]) => (
                    <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        }
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportCsv}
            aria-label="Export this page of work items as CSV"
            disabled={table.rows.length === 0}
            className="h-10 gap-1.5 sm:h-9"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        }
      />

      <DataTable
        table={table}
        columns={columns}
        rowKey={(row) => `${row.kind}:${row.item_id}:${row.owner_id}`}
        onRowClick={open}
        layout={dense ? 'table' : view}
        emptyIcon={ClipboardList}
        emptyTitle="Nothing in this slice"
        emptyDescription="No work matches this period and filter. Zero here means nothing was assigned — not that data is missing."
        rowActions={(row) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              open(row);
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open
          </Button>
        )}
      />

      {/* The dense drill-down pages by 10, so 10 has to be an offerable size —
          a Select whose value matches no item renders blank. */}
      <TablePagination
        table={table}
        entityLabel="work items"
        pageSizeOptions={dense ? [10, 25, 50] : [25, 50, 100]}
      />
    </div>
  );
};

export default WorkItemsPanel;
