import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Download, Plus, ShieldAlert, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import TablePagination from '@/components/common/TablePagination';
import StatusBadge from '@/components/common/StatusBadge';
import { useServerTable } from '@/hooks/useServerTable';
import { defaultSort } from '@/lib/tableQuery';
import { downloadCsv } from '@/lib/exportCsv';
import { roleMeta } from '@/lib/statusMeta';
import { fetchStaffPage, type StaffMember } from '@/lib/staff';

type StatusFilter = 'all' | 'active' | 'inactive';

const StaffListPage = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusFilter>('all');

  const filters = useMemo(
    () => ({ status: status === 'all' ? undefined : status }),
    [status]
  );

  const table = useServerTable<StaffMember>({
    queryKey: ['staff', 'list'],
    fetchPage: fetchStaffPage,
    initialSort: defaultSort('full_name', 'asc'),
    filters,
    persistKey: 'staff-list',
  });

  const columns: DataTableColumn<StaffMember>[] = [
    {
      id: 'full_name',
      header: 'Name',
      sortKey: 'full_name',
      mobile: 'title',
      cell: (s) => (
        <div className="min-w-0">
          <div className="truncate font-semibold text-foreground">{s.full_name}</div>
          {s.email && <div className="truncate text-xs text-muted-foreground">{s.email}</div>}
        </div>
      ),
    },
    {
      id: 'role',
      header: 'Role',
      mobile: 'subtitle',
      cell: (s) =>
        s.role ? (
          <StatusBadge value={s.role} map={roleMeta} />
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning">
            <ShieldAlert className="h-3.5 w-3.5" /> No role
          </span>
        ),
    },
    {
      id: 'mobile',
      header: 'Mobile',
      sortKey: 'mobile',
      cell: (s) => (
        <a
          href={`tel:${s.mobile}`}
          onClick={(e) => e.stopPropagation()}
          className="font-semibold text-primary hover:underline"
        >
          {s.mobile}
        </a>
      ),
    },
    {
      id: 'is_active',
      header: 'Status',
      sortKey: 'is_active',
      cell: (s) => (
        <StatusBadge
          value={s.is_active ? 'active' : 'inactive'}
          map={{
            active: { label: 'Active', tone: 'success' },
            inactive: { label: 'Inactive', tone: 'danger' },
          }}
        />
      ),
    },
    {
      id: 'last_login',
      header: 'Last Login',
      sortKey: 'last_login',
      hideBelow: 'lg',
      cell: (s) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {s.last_login ? format(new Date(s.last_login), 'dd MMM yyyy') : 'Never'}
        </span>
      ),
    },
  ];

  const exportCurrentPage = () =>
    downloadCsv(
      'staff.csv',
      [
        { header: 'Name', value: (s: StaffMember) => s.full_name },
        { header: 'Mobile', value: (s: StaffMember) => s.mobile },
        { header: 'Email', value: (s: StaffMember) => s.email ?? '' },
        { header: 'Role', value: (s: StaffMember) => s.role ?? 'none' },
        { header: 'Active', value: (s: StaffMember) => (s.is_active ? 'yes' : 'no') },
        {
          header: 'Last Login',
          value: (s: StaffMember) =>
            s.last_login ? format(new Date(s.last_login), 'yyyy-MM-dd HH:mm') : '',
        },
      ],
      table.rows
    );

  return (
    <PageContainer>
      <PageHeader
        title="Staff"
        icon={Users}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={exportCurrentPage}
              disabled={table.rows.length === 0}
            >
              <Download className="h-4 w-4" /> Export page
            </Button>
            <Button size="sm" className="gap-2" onClick={() => navigate('/staff/new')}>
              <Plus className="h-4 w-4" /> Add staff
            </Button>
          </>
        }
      />

      <TableToolbar
        table={table}
        searchPlaceholder="Search by name, mobile or email…"
        activeFilterCount={status === 'all' ? 0 : 1}
        onClearFilters={() => setStatus('all')}
        filters={
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Account status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="inactive">Inactive only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <DataTable
        table={table}
        columns={columns}
        rowKey={(s) => s.id}
        onRowClick={(s) => navigate(`/staff/${s.id}`)}
        emptyTitle="No staff yet"
        emptyDescription="Add your first team member to give them portal access."
        emptyIcon={Users}
        emptyAction={
          <Button size="sm" className="gap-2" onClick={() => navigate('/staff/new')}>
            <Plus className="h-4 w-4" /> Add staff
          </Button>
        }
      />

      <TablePagination table={table} entityLabel="staff" />
    </PageContainer>
  );
};

export default StaffListPage;
