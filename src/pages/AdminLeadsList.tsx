import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { canBulkAssignLeads, canBinLeads } from '@/lib/capabilities';
import { Button } from '@/components/ui/button';
import { CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Calendar as CalIcon, Download, Filter, PhoneCall, Search, Upload, Phone, RefreshCw, Trash2, Pencil, MoreVertical } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { downloadCsv } from '@/lib/exportCsv';
import { useStickyState } from '@/hooks/useStickyState';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { Database } from '@/integrations/supabase/types';
import LeadImportWizard from '@/components/leads/LeadImportWizard';
import { fetchConsumerDetails } from '@/lib/discom';
import TablePagination from '@/components/common/TablePagination';
import PageContainer from '@/components/common/PageContainer';
import PageHeader from '@/components/common/PageHeader';
import TableToolbar, { type ToolbarView } from '@/components/common/TableToolbar';
import { defaultTableView, type TableView } from '@/components/common/ViewToggle';
import DataTable, { type DataTableColumn } from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ServerTable, SortState } from '@/hooks/useServerTable';
import { leadStatusMeta, type StatusTone } from '@/lib/statusMeta';

type LeadStatus = Database['public']['Enums']['lead_status'];
type PaymentType = Database['public']['Enums']['payment_type'];
type ProjectStatus = Database['public']['Enums']['project_status'];

type StaffMember = {
  full_name: string;
  is_active: boolean;
  mobile?: string | null;
  role?: string;
  user_id: string;
};

type LeadRow = {
  assignedToName: string;
  assignedToUserId: string | null;
  assignedToMobile: string | null;
  assignedToRole: string | null;
  consumerName: string;
  createdAt: string;
  createdByName: string;
  createdByUserId: string;
  createdByMobile: string | null;
  createdByRole: string | null;
  hasQuotation: boolean;
  id: string;
  lastActivityAt: string;
  lastNote: string;
  latestUpdate: string;
  latestUpdatedBy: string;
  leadCode: string;
  mobile: string;
  nextFollowUpDate: string | null;
  operatorName: string;
  operatorUserId: string | null;
  projectStatus: ProjectStatus | null;
  projectType: PaymentType | null;
  status: LeadStatus;
  kNumber: string | null;
  email: string | null;
};


type StatusFilter = 'all' | LeadStatus | 'documents_pending' | 'quotation_sent' | 'site_visit';
type DateFilter = 'all' | 'today' | 'this_week' | 'this_month' | 'custom';

const statusLabel = (s: string) => s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const formatDate = (value: string | null) => value
  ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

const formatDateTime = (value: string | null) => value
  ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const startOfWeek = () => {
  const date = startOfToday();
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  return date;
};

const startOfMonth = () => {
  const date = startOfToday();
  date.setDate(1);
  return date;
};


/**
 * Whether a lead matches a stage filter. Shared by the table filter and the
 * the stage tabs so a count can never disagree with what clicking it shows.
 */
const matchesStatusFilter = (lead: LeadRow, filter: StatusFilter): boolean =>
  filter === 'all'
  || (filter === 'documents_pending' && lead.projectStatus === 'pending_documents')
  || (filter === 'quotation_sent' && lead.hasQuotation)
  || (filter === 'site_visit' && lead.status === 'visited')
  || lead.status === filter;

/** Stages shown in the pipeline bar, in the order a lead moves through them. */
const STAGE_BAR_STAGES: { value: StatusFilter; label: string; tone: StatusTone }[] = [
  { value: 'new', label: 'New', tone: 'info' },
  { value: 'site_visit', label: 'Contacted', tone: 'progress' },
  { value: 'follow_up', label: 'Follow Up', tone: 'warning' },
  { value: 'interested', label: 'Interested', tone: 'success' },
  { value: 'quotation_sent', label: 'Quoted', tone: 'info' },
  { value: 'final', label: 'Finalized', tone: 'success' },
  { value: 'not_interested', label: 'Not Interested', tone: 'danger' },
  { value: 'cancelled', label: 'Cancelled', tone: 'danger' },
];

/**
 * Maps one `leads_list` row to the shape the table renders. The view already
 * resolved the latest visit, the latest project and whether a quotation exists,
 * so this is a straight rename rather than the client-side join it replaces.
 */
const mapLeadRow = (lead: any, staffMap: Record<string, StaffMember>): LeadRow => ({
  assignedToName: lead.assigned_to_user_id ? staffMap[lead.assigned_to_user_id]?.full_name || 'Not assigned' : 'Not assigned',
  assignedToUserId: lead.assigned_to_user_id,
  assignedToMobile: lead.assigned_to_user_id ? staffMap[lead.assigned_to_user_id]?.mobile || null : null,
  assignedToRole: lead.assigned_to_user_id ? staffMap[lead.assigned_to_user_id]?.role || null : null,
  consumerName: lead.customer_name,
  createdAt: lead.created_at,
  createdByName: staffMap[lead.created_by_user_id]?.full_name || 'Unknown user',
  createdByUserId: lead.created_by_user_id,
  createdByMobile: staffMap[lead.created_by_user_id]?.mobile || null,
  createdByRole: staffMap[lead.created_by_user_id]?.role || null,
  hasQuotation: lead.has_quotation === true,
  id: lead.id,
  lastActivityAt: lead.last_activity_at || lead.updated_at || lead.created_at,
  lastNote: lead.last_visit_notes?.trim() || lead.notes?.trim() || '—',
  latestUpdate: lead.last_visit_status
    ? statusLabel(lead.last_visit_status)
    : lead.project_status === 'pending_documents'
      ? 'Documents Pending'
      : lead.has_quotation
        ? 'Quotation Sent'
        : statusLabel(lead.status),
  latestUpdatedBy: lead.last_visit_staff_id ? staffMap[lead.last_visit_staff_id]?.full_name || 'Staff member' : 'System',
  leadCode: lead.id.slice(0, 8).toUpperCase(),
  mobile: lead.mobile,
  nextFollowUpDate: lead.follow_up_date,
  operatorName: lead.assigned_operator_id ? staffMap[lead.assigned_operator_id]?.full_name || 'Unassigned' : 'Unassigned',
  operatorUserId: lead.assigned_operator_id || null,
  projectStatus: lead.project_status || null,
  projectType: lead.project_type || null,
  status: lead.status,
  kNumber: lead.k_number,
  email: lead.email,
});

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200];

const AdminLeadsList = ({ isEmbedded = false }: { isEmbedded?: boolean }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const requestIdRef = useRef(0);

  // Raw `leads_list` rows, mapped to LeadRow at render time. The view is not in
  // the generated types, hence the loose row shape.
  const [rawLeads, setRawLeads] = useState<Record<string, unknown>[]>([]);
  const [syncingKno, setSyncingKno] = useState<string | null>(null);
  const [salesTab, setSalesTab] = useState<'my_visits' | 'unassigned_visits'>('my_visits');
  const { user, role } = useAuth();
  const [staffDirectory, setStaffDirectory] = useState<Record<string, StaffMember>>({});
  const [salesStaff, setSalesStaff] = useState<StaffMember[]>([]);
  const [operatorStaff, setOperatorStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useStickyState<string>('admin-leads:search', '');
  // The query keys off the debounced value, not the raw one: `search` changes on
  // every keystroke, and buildLeadsQuery's identity drives both the fetch effect
  // and the realtime subscription.
  const debouncedSearch = useDebouncedValue(search, 300);
  const [filterStatus, setFilterStatus] = useStickyState<StatusFilter>('admin-leads:status', 'all');
  const [filterCreator, setFilterCreator] = useStickyState<string>('admin-leads:creator', 'all');
  const [filterAssigned, setFilterAssigned] = useStickyState<string>('admin-leads:assigned', 'all');
  const [filterOperator, setFilterOperator] = useStickyState<string>('admin-leads:operator', 'all');
  const [filterProjectType, setFilterProjectType] = useStickyState<'all' | PaymentType>('admin-leads:projectType', 'all');
  const [filterDate, setFilterDate] = useStickyState<DateFilter>('admin-leads:date', 'all');
  const [customFrom, setCustomFrom] = useStickyState<string>('admin-leads:customFrom', '');
  const [customTo, setCustomTo] = useStickyState<string>('admin-leads:customTo', '');
  // A column + direction rather than a named enum, so the shared table's
  // sortable headers drive it directly. Every value is a real leads_list column.
  const [sort, setSort] = useStickyState<SortState>('admin-leads:sort2', {
    column: 'last_activity_at',
    direction: 'desc',
  });
  const [editingCreatorId, setEditingCreatorId] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState<string>('');
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useStickyState<number>('admin-leads:pageSize', 50);
  const [view, setView] = useStickyState<TableView>('admin-leads:view', defaultTableView());
  const [total, setTotal] = useState(0);
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LeadRow | null>(null);
  const [knoTarget, setKnoTarget] = useState<LeadRow | null>(null);
  const [knoDraft, setKnoDraft] = useState('');
  const [savingKno, setSavingKno] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const kanbanColumns: { status: LeadStatus; label: string; color: string }[] = [
    { status: 'new', label: 'New', color: 'border-t-2 border-t-sky-500' },
    { status: 'visited', label: 'Site Visit', color: 'border-t-2 border-t-purple-500' },
    { status: 'follow_up', label: 'Follow-up', color: 'border-t-2 border-t-amber-500' },
    { status: 'interested', label: 'Interested', color: 'border-t-2 border-t-emerald-500' },
    { status: 'final', label: 'Finalized', color: 'border-t-2 border-t-rose-500' },
  ];

  /**
   * Every filter and sort runs in the database against `leads_list`, so only
   * the rows on screen are fetched. Doing this in the browser meant loading all
   * leads first, which PostgREST capped at 1000 — leads past that were
   * unreachable no matter how you filtered.
   */
  const buildLeadsQuery = useCallback(() => {
    const filterStatusValue = filterStatus;
    let query = supabase
      .from('leads_list' as any)
      .select('*', { count: 'exact' })
      .eq('is_in_bin', false);

    // Commas and parens are PostgREST `or()` syntax, so they are stripped
    // rather than escaped.
    const term = debouncedSearch.trim().replace(/[,()*]/g, ' ').trim();
    if (term) {
      query = query.or(
        [`customer_name.ilike.%${term}%`, `mobile.ilike.%${term}%`, `k_number.ilike.%${term}%`].join(','),
      );
    }

    if (filterStatusValue === 'documents_pending') query = query.eq('project_status', 'pending_documents');
    else if (filterStatusValue === 'quotation_sent') query = query.eq('has_quotation', true);
    else if (filterStatusValue === 'site_visit') query = query.eq('status', 'visited');
    else if (filterStatusValue !== 'all') query = query.eq('status', filterStatusValue);

    if (filterCreator !== 'all') query = query.eq('created_by_user_id', filterCreator);
    if (filterAssigned === 'unassigned') query = query.is('assigned_to_user_id', null);
    else if (filterAssigned !== 'all') query = query.eq('assigned_to_user_id', filterAssigned);
    if (filterOperator !== 'all') query = query.eq('assigned_operator_id', filterOperator);
    if (filterProjectType !== 'all') query = query.eq('project_type', filterProjectType);

    if (filterDate === 'today') query = query.gte('last_activity_at', startOfToday().toISOString());
    else if (filterDate === 'this_week') query = query.gte('last_activity_at', startOfWeek().toISOString());
    else if (filterDate === 'this_month') query = query.gte('last_activity_at', startOfMonth().toISOString());
    else if (filterDate === 'custom') {
      if (customFrom) query = query.gte('last_activity_at', new Date(`${customFrom}T00:00:00`).toISOString());
      if (customTo) query = query.lte('last_activity_at', new Date(`${customTo}T23:59:59`).toISOString());
    }

    // The sales rep queues were client-side filters over the full list; as
    // server filters they now page correctly.
    if (role === 'sales_person' && user) {
      if (salesTab === 'my_visits') {
        query = query.or(`assigned_to_user_id.eq.${user.id},created_by_user_id.eq.${user.id}`);
      } else if (salesTab === 'unassigned_visits') {
        query = query.is('assigned_to_user_id', null).not('follow_up_date', 'is', null);
      }
    }

    return query.order(sort.column, { ascending: sort.direction === 'asc', nullsFirst: false });
  }, [customFrom, customTo, debouncedSearch, filterAssigned, filterCreator, filterDate, filterOperator, filterProjectType, filterStatus, role, salesTab, sort, user]);

  /**
   * The staff directory changes on its own schedule, not with the filters, so it
   * loads once per role rather than riding along on every lead fetch. Keeping it
   * out of fetchData also keeps fetchData independent of staffDirectory — names
   * are resolved when the rows are rendered, not when they are fetched.
   */
  useEffect(() => {
    if (!role) return;
    let cancelled = false;

    void (async () => {
      try {
        // staff and user_roles are admin-only under RLS, so a non-admin reading
        // them directly gets just their own row and every name on the list renders
        // as "Unknown user". get_staff_directory() is the SECURITY DEFINER view of
        // the same data (active staff only) already used by Staff Contacts.
        const isAdmin = role === 'admin';

        const [staffRes, rolesRes, directoryRes] = await Promise.all([
          isAdmin ? supabase.from('staff').select('user_id, full_name, mobile, is_active') : Promise.resolve({ data: [], error: null }),
          isAdmin ? supabase.from('user_roles').select('user_id, role') : Promise.resolve({ data: [], error: null }),
          isAdmin ? Promise.resolve({ data: [], error: null }) : supabase.rpc('get_staff_directory' as any),
        ]);

        if (staffRes.error) throw staffRes.error;
        if (rolesRes.error) throw rolesRes.error;
        if (directoryRes.error) throw directoryRes.error;
        if (cancelled) return;

        const rolesByUser = new Map((rolesRes.data || []).map((item) => [item.user_id, item.role]));
        const staffMap = Object.fromEntries(
          isAdmin
            ? (staffRes.data || []).map((item) => [item.user_id, { ...item, role: rolesByUser.get(item.user_id) }])
            : ((directoryRes.data as { user_id: string; full_name: string; mobile: string; role: string }[]) || []).map(
                (item) => [item.user_id, { ...item, is_active: true }],
              ),
        ) as Record<string, StaffMember>;

        setStaffDirectory(staffMap);
        setSalesStaff(Object.values(staffMap).filter((item) => item.role === 'sales_person' && item.is_active).sort((a, b) => a.full_name.localeCompare(b.full_name)));
        setOperatorStaff(Object.values(staffMap).filter((item) => item.role === 'operator' && item.is_active).sort((a, b) => a.full_name.localeCompare(b.full_name)));
      } catch (error: any) {
        if (!cancelled) toast({ title: 'Unable to load staff', description: error.message || 'Please try again.', variant: 'destructive' });
      }
    })();

    return () => { cancelled = true; };
  }, [role, toast]);

  /**
   * Arguments for `leads_stage_counts`, which replaces the eight per-stage
   * `count: 'exact'` queries the stage bar used to issue. Nine scans of
   * `leads_list` per render was enough to push queries past the 8s
   * statement_timeout and starve unrelated endpoints.
   *
   * These must stay in step with buildLeadsQuery above — every filter there
   * except the stage itself belongs here, or a count will disagree with the
   * list clicking it produces.
   */
  const buildStageCountArgs = useCallback(() => {
    const term = debouncedSearch.trim().replace(/[,()*]/g, ' ').trim();

    let from: string | null = null;
    let to: string | null = null;
    if (filterDate === 'today') from = startOfToday().toISOString();
    else if (filterDate === 'this_week') from = startOfWeek().toISOString();
    else if (filterDate === 'this_month') from = startOfMonth().toISOString();
    else if (filterDate === 'custom') {
      if (customFrom) from = new Date(`${customFrom}T00:00:00`).toISOString();
      if (customTo) to = new Date(`${customTo}T23:59:59`).toISOString();
    }

    return {
      _search: term || null,
      _creator: filterCreator !== 'all' ? filterCreator : null,
      _assigned: filterAssigned !== 'all' && filterAssigned !== 'unassigned' ? filterAssigned : null,
      _unassigned: filterAssigned === 'unassigned',
      _operator: filterOperator !== 'all' ? filterOperator : null,
      _project_type: filterProjectType !== 'all' ? filterProjectType : null,
      _from: from,
      _to: to,
      _scope: role === 'sales_person' && user ? salesTab : 'all',
      _scope_user: role === 'sales_person' && user ? user.id : null,
    };
  }, [customFrom, customTo, debouncedSearch, filterAssigned, filterCreator, filterDate, filterOperator, filterProjectType, role, salesTab, user]);

  const fetchData = useCallback(async (background = false) => {
    const requestId = ++requestIdRef.current;
    if (!background) setLoading(true);

    try {
      // Two queries per render: the page itself, and one grouped count for the
      // whole stage bar. They are independent, so they go out together.
      const [leadsRes, stageRes] = await Promise.all([
        buildLeadsQuery().range(page * pageSize, page * pageSize + pageSize - 1),
        supabase.rpc('leads_stage_counts' as any, buildStageCountArgs()),
      ]);

      if (leadsRes.error) throw leadsRes.error;
      if (requestId !== requestIdRef.current) return;

      setTotal(leadsRes.count ?? 0);
      setRawLeads((leadsRes.data as unknown as Record<string, unknown>[]) || []);

      // The stage bar is decoration around the list; if only its count fails,
      // show the list rather than failing the whole page.
      if (stageRes.error) setStageCounts({});
      else setStageCounts((stageRes.data as Record<string, number>) || {});
    } catch (error: any) {
      toast({ title: 'Unable to load leads', description: error.message || 'Please try again.', variant: 'destructive' });
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [buildLeadsQuery, buildStageCountArgs, page, pageSize, toast]);

  // Any filter change re-queries from the first page; staying on page 7 of a
  // result set that just shrank to two pages would show an empty table.
  useEffect(() => { setPage(0); }, [buildLeadsQuery]);

  /**
   * Corrects a lead's K Number. The previously synced Discom payload belonged
   * to the old number, so it is cleared rather than left to describe a
   * different connection — re-sync to repopulate it.
   */
  const saveKno = async () => {
    if (!knoTarget) return;
    const next = knoDraft.trim();
    if (!/^\d{12}$/.test(next)) {
      toast({ title: 'Invalid K Number', description: 'Must be exactly 12 digits.', variant: 'destructive' });
      return;
    }
    setSavingKno(true);
    try {
      const { error } = await supabase
        .from('leads')
        .update({ k_number: next, kno_details: null })
        .eq('id', knoTarget.id);
      if (error) throw error;
      toast({ title: 'K Number updated', description: 'Sync with Discom to refresh the consumer details.' });
      setKnoTarget(null);
      await fetchData(true);
    } catch (err: any) {
      toast({ title: 'Could not update K Number', description: err.message, variant: 'destructive' });
    } finally {
      setSavingKno(false);
    }
  };

  const handleSyncKno = async (leadId: string, kno: string) => {
    if (!kno || kno.length !== 12) return;
    setSyncingKno(leadId);
    try {
      const response = await fetchConsumerDetails(kno);
      if (response && response.ok && response.data && response.data.KNO) {
        const knoData = response.data.KNO;
        
        let city = '';
        let district = '';
        const addrLower = (knoData.address || '').toLowerCase();
        if (addrLower.includes('kota')) {
          city = 'Kota';
          district = 'Kota';
        } else if (addrLower.includes('jaipur')) {
          city = 'Jaipur';
          district = 'Jaipur';
        } else {
          const officeName = (knoData.officename || '').toLowerCase();
          if (officeName.includes('kota')) {
            city = 'Kota';
            district = 'Kota';
          } else {
            city = knoData.officename || '';
            district = knoData.officename || '';
          }
        }

        const { error } = await supabase.from('leads').update({
          kno_details: knoData,
          latitude: knoData.latitude ? parseFloat(String(knoData.latitude)) : null,
          longitude: knoData.longitude ? parseFloat(String(knoData.longitude)) : null,
          kw_interest: knoData.solarloadkw ? parseFloat(String(knoData.solarloadkw)) : (knoData.connload ? parseFloat(String(knoData.connload)) : null)
        }).eq('id', leadId);

        if (error) throw error;
        toast({ title: 'Discom Details Synced!', description: `Loaded name: ${knoData.name || 'N/A'}` });
        void fetchData(true);
      } else {
        toast({ title: 'Sync Failed', description: 'Could not fetch details for this K-Number.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Sync Failed', description: err.message || 'Error occurred.', variant: 'destructive' });
    } finally {
      setSyncingKno(null);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Held in a ref so the subscription below can mount once. Depending on
  // fetchData directly tore the channel down and re-subscribed it on every
  // keystroke and filter change.
  const fetchDataRef = useRef(fetchData);
  useEffect(() => { fetchDataRef.current = fetchData; }, [fetchData]);

  useEffect(() => {
    // A single write touches several of these tables, and an import touches them
    // in a burst, so refreshes are coalesced onto a trailing timer rather than
    // firing one full reload per event.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void fetchDataRef.current(true); }, 400);
    };

    const channel = supabase
      .channel('admin-leads-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_visits' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotations' }, scheduleRefresh)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, []);

  // Names are resolved at render time, so the directory arriving after the rows
  // fills them in without refetching the leads.
  const leadRows = useMemo(
    () => rawLeads.map((lead) => mapLeadRow(lead, staffDirectory)),
    [rawLeads, staffDirectory],
  );

  const allStaff = useMemo(() => Object.values(staffDirectory).sort((a, b) => a.full_name.localeCompare(b.full_name)), [staffDirectory]);

  /**
   * Reassigning, importing and changing a lead's creator are ownership
   * operations reserved for admins — `bulk_assign_leads` rejects anyone else
   * server-side, so showing these to a telecaller would only produce errors.
   * Everything else on this page is scoped by RLS and safe for any role that
   * has the CRM module.
   */
  // Two different rights, previously collapsed into one admin check.
  // bulk_assign_leads permits admin OR operator, so an operator was being
  // denied a capability the database grants; bulk_bin_leads and the hard delete
  // stay admin-only. Selection exists to serve either.
  const canAssign = canBulkAssignLeads(role);
  const canBin = canBinLeads(role);
  const canManageLeads = canAssign || canBin;

  /** Anyone a lead can sit with — telecallers and sales reps. */
  const assignableStaff = useMemo(
    () => allStaff.filter((m) => m.is_active && (m.role === 'telecaller' || m.role === 'sales_person')),
    [allStaff],
  );

  // Filtering, sorting and paging all happen in the database now, so the rows
  // that come back are exactly the rows to render.
  const filteredRows = leadRows;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const analytics = useMemo(() => ({
    total: filteredRows.length,
    interested: filteredRows.filter((lead) => lead.status === 'interested').length,
    followUp: filteredRows.filter((lead) => lead.status === 'follow_up').length,
    notInterested: filteredRows.filter((lead) => lead.status === 'not_interested').length,
    finalized: filteredRows.filter((lead) => lead.status === 'final').length,
    converted: filteredRows.filter((lead) => lead.status === 'final' || !!lead.projectType).length,
  }), [filteredRows]);

  const staffAnalytics = useMemo(() => {
    const metrics = new Map<string, { name: string; created: number; assigned: number; converted: number; followUps: number }>();
    const ensure = (userId: string | null, name: string) => {
      if (!userId) return null;
      if (!metrics.has(userId)) metrics.set(userId, { name, created: 0, assigned: 0, converted: 0, followUps: 0 });
      return metrics.get(userId)!;
    };

    filteredRows.forEach((lead) => {
      const creator = ensure(lead.createdByUserId, lead.createdByName);
      if (creator) {
        creator.created += 1;
        if (lead.status === 'final' || lead.projectType) creator.converted += 1;
      }
      const assignee = ensure(lead.assignedToUserId, lead.assignedToName);
      if (assignee) {
        assignee.assigned += 1;
        if (lead.status === 'follow_up') assignee.followUps += 1;
      }
    });

    return Array.from(metrics.values()).map((metric) => ({
      ...metric,
      ratio: metric.created ? Math.round((metric.converted / metric.created) * 100) : 0,
    })).sort((a, b) => (b.created + b.assigned) - (a.created + a.assigned)).slice(0, 8);
  }, [filteredRows]);

  // Stage is deliberately absent: it has its own dropdown in the toolbar row, so
  // counting it here would badge the popover for a filter it does not contain —
  // the mirror of the "applied with no visible control" trap the popover guards.
  const activeFilterCount = [
    filterCreator !== 'all',
    filterAssigned !== 'all',
    filterOperator !== 'all',
    filterProjectType !== 'all',
    filterDate !== 'all',
  ].filter(Boolean).length;


  const bulkAssign = async () => {
    if (selectedIds.size === 0 || !bulkAssignee) return;
    setBulkAssigning(true);
    try {
      const { error } = await supabase.rpc('bulk_assign_leads' as any, {
        _lead_ids: Array.from(selectedIds),
        _assignee: bulkAssignee,
      });
      if (error) throw error;

      const name = staffDirectory[bulkAssignee]?.full_name || 'staff member';
      toast({
        title: `${selectedIds.size} lead${selectedIds.size > 1 ? 's' : ''} assigned`,
        description: `Now with ${name}.`,
      });
      setSelectedIds(new Set());
      setBulkAssignee('');
      fetchData(true);
    } catch (err: any) {
      toast({ title: 'Bulk assignment failed', description: err.message, variant: 'destructive' });
    } finally {
      setBulkAssigning(false);
    }
  };

  /**
   * "Delete" moves the lead to the Cancelled Bin rather than destroying it, so
   * it stays recoverable there. Permanent removal remains a separate, explicit
   * action on the bin page.
   */
  const binLeads = async (ids: string[], label: string) => {
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      const { error } = await supabase.rpc('bulk_bin_leads' as any, { _lead_ids: ids });
      if (error) throw error;
      toast({ title: `${label} moved to Cancelled Bin`, description: 'You can restore it from the bin.' });
      setSelectedIds(new Set());
      setDeleteTarget(null);
      setConfirmBulkDelete(false);
      await fetchData(true);
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const updateCreator = async (leadId: string, userId: string) => {
    try {
      const { error } = await supabase.from('leads').update({ created_by_user_id: userId }).eq('id', leadId);
      if (error) throw error;
      // Patch the raw row; mapLeadRow resolves the name from the directory.
      setRawLeads((current) => current.map((lead) => lead.id === leadId
        ? { ...lead, created_by_user_id: userId }
        : lead));
      setEditingCreatorId(null);
      toast({ title: 'Creator updated' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const resetFilters = () => {
    // Not the stage — Clear empties the popover, and the stage lives outside it.
    setFilterCreator('all');
    setFilterAssigned('all');
    setFilterOperator('all');
    setFilterProjectType('all');
    setFilterDate('all');
    setCustomFrom('');
    setCustomTo('');
    setSort({ column: 'last_activity_at', direction: 'desc' });
  };

  const exportRows = () => {
    downloadCsv('leads-crm-export.csv', [
      { header: 'K Number', value: (row: LeadRow) => row.kNumber ?? '' },
      { header: 'Consumer Name', value: (row: LeadRow) => row.consumerName },
      { header: 'Mobile Number', value: (row: LeadRow) => row.mobile },
      { header: 'Created By', value: (row: LeadRow) => row.createdByName },
      { header: 'Assigned To', value: (row: LeadRow) => row.assignedToName },
      { header: 'Assigned Operator', value: (row: LeadRow) => row.operatorName },
      { header: 'Status', value: (row: LeadRow) => statusLabel(row.status) },
      { header: 'Last Note', value: (row: LeadRow) => row.lastNote },
      { header: 'Latest Update', value: (row: LeadRow) => row.latestUpdate },
      { header: 'Last Activity Date', value: (row: LeadRow) => formatDateTime(row.lastActivityAt) },
      { header: 'Updated By', value: (row: LeadRow) => row.latestUpdatedBy },
      { header: 'Next Follow-up Date', value: (row: LeadRow) => formatDate(row.nextFollowUpDate) },
      { header: 'Project Type', value: (row: LeadRow) => row.projectType ? statusLabel(row.projectType) : '—' },
    ], filteredRows);
  };

  /**
   * The shared shells take a `ServerTable`. This page already does everything
   * that hook does — server-side filter, sort and paging over `leads_list`,
   * with a request-id guard and stage counts kept in step — so it adapts its
   * own state to that shape rather than being rewritten onto the hook. The
   * previous `as any` cast into TablePagination is what this replaces.
   */
  // "All" carries the unfiltered total; each stage carries its own tally, so the
  // dropdown says as much as the tab strip did without spending a row on it.
  const stageViews: ToolbarView[] = useMemo(
    () => [
      { value: 'all', label: 'All', count: total },
      ...STAGE_BAR_STAGES.map((stage) => ({
        value: stage.value,
        label: stage.label,
        count: stageCounts[stage.value] ?? 0,
      })),
    ],
    [total, stageCounts]
  );

  const leadsTable: ServerTable<LeadRow> = useMemo(
    () => ({
      rows: leadRows,
      total,
      page,
      pageCount,
      pageSize,
      setPage,
      setPageSize: (size: number) => {
        setPageSize(size);
        setPage(0);
      },
      search,
      setSearch: (value: string) => {
        setSearch(value);
        setPage(0);
      },
      isSearching: debouncedSearch.length > 0,
      sort,
      setSort,
      toggleSort: (column: string) =>
        setSort((current) =>
          current.column === column
            ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
            : { column, direction: 'asc' }
        ),
      isLoading: loading,
      isFetching: loading,
      error: null,
      refetch: (() => fetchData(true)) as unknown as ServerTable<LeadRow>['refetch'],
    }),
    [debouncedSearch, fetchData, leadRows, loading, page, pageCount, pageSize, search, setPageSize, setSearch, setSort, sort, total]
  );

  const columns: DataTableColumn<LeadRow>[] = [
    {
      id: 'k_number',
      header: 'K Number',
      sortKey: 'k_number',
      mobile: 'title',
      cell: (lead) =>
        lead.kNumber ? (
          <span className="font-mono text-xs font-bold text-foreground">{lead.kNumber}</span>
        ) : (
          <span className="text-xs text-muted-foreground/60">Not linked</span>
        ),
    },
    {
      id: 'status',
      header: 'Status',
      sortKey: 'status',
      mobile: 'badge',
      // StatusBadge, not the page-local solid-fill `statusColor` map this file
      // used to carry — that was a second visual language for lead status.
      cell: (lead) => <StatusBadge value={lead.status} map={leadStatusMeta} size="sm" />,
    },
    {
      id: 'consumer',
      header: 'Consumer',
      sortKey: 'customer_name',
      mobile: 'subtitle',
      cell: (lead) => (
        <div className="min-w-0">
          <div className="truncate font-semibold text-foreground" title={lead.consumerName}>
            {lead.consumerName}
          </div>
          {lead.mobile && (
            <a
              href={`tel:${lead.mobile}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-medium text-primary hover:underline"
            >
              {lead.mobile}
            </a>
          )}
        </div>
      ),
    },
    {
      id: 'assigned',
      header: 'Assigned',
      mobile: 'meta',
      hideBelow: 'lg',
      cell: (lead) => (
        <span className={lead.assignedToName === 'Not assigned' ? 'italic text-muted-foreground' : ''}>
          {lead.assignedToName}
        </span>
      ),
    },
    {
      id: 'last_activity',
      header: 'Last Updated',
      sortKey: 'last_activity_at',
      mobile: 'meta',
      cell: (lead) => (
        <span className="whitespace-nowrap">{formatDateTime(lead.lastActivityAt)}</span>
      ),
    },
    {
      id: 'follow_up',
      header: 'Follow-up',
      sortKey: 'follow_up_date',
      hideBelow: 'xl',
      mobile: 'hidden',
      cell: (lead) => <span className="whitespace-nowrap">{formatDate(lead.nextFollowUpDate)}</span>,
    },
  ];

  /** The bulk action bar, unchanged — it appears above the table when rows are picked. */
  const bulkBar = canManageLeads ? (
          <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Selection state: the count is the thing to read first, so it carries
                the emphasis. Clear sits with it — both concern the selection, not the leads. */}
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold tabular-nums text-primary-foreground">
                {selectedIds.size}
              </span>
              <p className="text-sm font-semibold text-foreground">
                lead{selectedIds.size > 1 ? 's' : ''} selected
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {/* Picker and its action are joined into one segmented control, so the
                  assign flow reads as a single thing rather than two loose buttons. */}
              {canAssign && (
              <div className="flex flex-1 sm:flex-none">
                <Select value={bulkAssignee} onValueChange={setBulkAssignee}>
                  <SelectTrigger className="h-9 w-full rounded-r-none text-sm sm:w-[220px]">
                    <SelectValue placeholder="Assign to…" />
                  </SelectTrigger>
                  <SelectContent>
                    {allStaff
                      .filter((m) => m.is_active && (m.role === 'telecaller' || m.role === 'sales_person'))
                      .map((m) => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {m.full_name}
                          {m.role ? ` · ${statusLabel(m.role)}` : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="h-9 shrink-0 rounded-l-none"
                  onClick={bulkAssign}
                  disabled={!bulkAssignee || bulkAssigning}
                >
                  {bulkAssigning ? 'Assigning…' : 'Assign'}
                </Button>
              </div>
              )}

              {/* Delete is held apart from Assign at every width — a mis-click here is
                  unrecoverable, and the two must never sit shoulder to shoulder. */}
              {canBin && (
              <>
              <Separator orientation="vertical" className="mx-1 h-6 shrink-0" />
              <Button
                size="sm"
                variant="ghost"
                className="h-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmBulkDelete(true)}
                disabled={deleting}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> Delete
              </Button>
              </>
              )}
            </div>
          </div>
  ) : null;

  /** Filter controls, now inside the shared FiltersPopover instead of a bespoke one. */
  const filterControls = (
    <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Created By</Label>
                  <Select value={filterCreator} onValueChange={setFilterCreator}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Staff</SelectItem>
                      {allStaff.map((member) => <SelectItem key={member.user_id} value={member.user_id}>{member.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Assigned To</Label>
                  <Select value={filterAssigned} onValueChange={setFilterAssigned}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Anyone</SelectItem>
                      <SelectItem value="unassigned">Not assigned</SelectItem>
                      {assignableStaff.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.full_name}{member.role === 'telecaller' ? ' (Telecaller)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Operator</Label>
                  <Select value={filterOperator} onValueChange={setFilterOperator}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Operators</SelectItem>
                      {operatorStaff.map((member) => <SelectItem key={member.user_id} value={member.user_id}>{member.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
    </div>
  );

  const Shell = isEmbedded
    ? ({ children }: { children: React.ReactNode }) => <div className="space-y-5">{children}</div>
    : PageContainer;

  return (
    <>
    <Shell>
      {!isEmbedded && (
        <PageHeader
          title="Leads"
          actions={
            // Create Lead is the one action people come here for, so it is the
            // only accented control; the bulk-data chores sit behind overflow.
            <div className="flex items-center gap-2">
              <Button
                onClick={() => navigate('/leads/new')}
                size="sm"
                className="h-10 gap-2 sm:h-9"
              >
                <PhoneCall className="h-4 w-4" /> Create Lead
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 w-10 shrink-0 p-0 sm:h-9 sm:w-9" aria-label="More lead actions">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canManageLeads && (
                    <DropdownMenuItem onClick={() => setIsImportOpen(true)}>
                      <Upload className="mr-2 h-4 w-4" /> Import Leads
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={exportRows} disabled={!leadRows.length}>
                    <Download className="mr-2 h-4 w-4" /> Export CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />
      )}

      {/* The sales rep's own queues. Still a role-specific control, but the
          shared Tabs rather than two hand-built buttons. */}
      {role === 'sales_person' && (
        <Tabs value={salesTab} onValueChange={(v) => { setSalesTab(v as typeof salesTab); setPage(0); }}>
          <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
            <TabsTrigger value="my_visits" className="h-11 text-xs sm:h-8 sm:text-sm">My Visits</TabsTrigger>
            <TabsTrigger value="unassigned_visits" className="h-11 text-xs sm:h-8 sm:text-sm">Unassigned</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {selectedIds.size > 0 && bulkBar}

      {/* Nine stages plus All. As a tab strip that was a sideways-scrolling band
          hiding its own last options; as a dropdown it is one control in the
          same row as search, filters and the layout toggle. */}
      <TableToolbar
        table={leadsTable}
        searchPlaceholder="Search by K-Number, name or mobile…"
        views={stageViews}
        activeView={filterStatus}
        onViewChange={(v) => { setFilterStatus(v as StatusFilter); setPage(0); }}
        viewsLabel="Filter by stage"
        layout={view}
        onLayoutChange={setView}
        activeFilterCount={activeFilterCount}
        onClearFilters={resetFilters}
        filters={filterControls}
      />

      <DataTable
        layout={view}
        table={leadsTable}
        columns={columns}
        rowKey={(lead) => lead.id}
        selectable={canManageLeads}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onRowClick={(lead) => navigate(`/leads/${lead.id}`)}
        rowActions={(lead) => (
          <>
            {lead.mobile && (
              <Button asChild variant="ghost" size="icon" className="h-9 w-9 text-primary">
                <a href={`tel:${lead.mobile}`} aria-label={`Call ${lead.consumerName}`}>
                  <Phone className="h-4 w-4" />
                </a>
              </Button>
            )}
            {lead.kNumber && (
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9"
                title="Sync with Discom"
                aria-label={`Sync ${lead.consumerName} with Discom`}
                onClick={() => handleSyncKno(lead.id, lead.kNumber)}
                disabled={syncingKno === lead.id}
              >
                <RefreshCw className={`h-4 w-4 text-muted-foreground ${syncingKno === lead.id ? 'animate-spin text-primary' : ''}`} />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              title={lead.kNumber ? 'Edit K Number' : 'Add K Number'}
              aria-label={`Edit K Number for ${lead.consumerName}`}
              onClick={() => { setKnoTarget(lead); setKnoDraft(lead.kNumber ?? ''); }}
            >
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </Button>
            {canBin && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Move to Cancelled Bin"
                aria-label={`Delete ${lead.consumerName}`}
                onClick={() => setDeleteTarget(lead)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
        emptyTitle="No leads yet"
        emptyDescription="Create a lead, or import a list, to get started."
        emptyIcon={PhoneCall}
      />

      <TablePagination table={leadsTable} entityLabel="leads" pageSizeOptions={PAGE_SIZE_OPTIONS} />
    </Shell>

      <LeadImportWizard
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImportComplete={() => void fetchData(true)}
      />

      <AlertDialog open={knoTarget !== null} onOpenChange={(open) => !open && setKnoTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{knoTarget?.kNumber ? 'Edit' : 'Add'} K Number</AlertDialogTitle>
            <AlertDialogDescription>
              For {knoTarget?.consumerName}. Must be 12 digits. Any Discom details already synced
              against the old number are cleared, so re-sync afterwards to pull the correct ones.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={knoDraft}
            onChange={(e) => setKnoDraft(e.target.value.replace(/\D/g, '').slice(0, 12))}
            placeholder="210721033383"
            inputMode="numeric"
            className="font-mono"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">{knoDraft.length}/12 digits</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingKno}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingKno || knoDraft.length !== 12}
              onClick={(e) => { e.preventDefault(); void saveKno(); }}
            >
              {savingKno ? 'Saving…' : 'Save'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move this lead to the Cancelled Bin?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.consumerName} will be removed from the leads list. You can restore it
              from the Cancelled Bin, or delete it permanently from there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) void binLeads([deleteTarget.id], deleteTarget.consumerName);
              }}
            >
              {deleting ? 'Moving…' : 'Move to Bin'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Move {selectedIds.size} lead{selectedIds.size > 1 ? 's' : ''} to the Cancelled Bin?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will be removed from the leads list. You can restore them from the Cancelled Bin,
              or delete them permanently from there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void binLeads(
                  Array.from(selectedIds),
                  `${selectedIds.size} lead${selectedIds.size > 1 ? 's' : ''}`,
                );
              }}
            >
              {deleting ? 'Moving…' : 'Move to Bin'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AdminLeadsList;
