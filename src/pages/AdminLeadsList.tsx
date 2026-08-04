import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { ArrowUpDown, Calendar as CalIcon, Download, Filter, PhoneCall, Search, Users, ChevronRight, Upload, Phone, RefreshCw, Trash2, Pencil } from 'lucide-react';
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
import StageBar from '@/components/common/StageBar';
import TablePagination from '@/components/common/TablePagination';
import type { StatusTone } from '@/lib/statusMeta';

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
type SortKey = 'latest_activity_desc' | 'created_desc' | 'follow_up_asc' | 'consumer_asc' | 'status_asc';

const statusColor: Record<string, string> = {
  new: 'bg-info text-info-foreground',
  visited: 'bg-accent text-accent-foreground',
  follow_up: 'bg-warning text-warning-foreground',
  interested: 'bg-success text-success-foreground',
  not_interested: 'bg-destructive text-destructive-foreground',
  cancelled: 'bg-muted text-muted-foreground',
  final: 'bg-primary text-primary-foreground',
};

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
 * StageBar counts so a count can never disagree with what clicking it shows.
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
  const [sortBy, setSortBy] = useStickyState<SortKey>('admin-leads:sort', 'latest_activity_desc');
  const [editingCreatorId, setEditingCreatorId] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState<string>('');
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useStickyState<number>('admin-leads:pageSize', 50);
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

    switch (sortBy) {
      case 'created_desc': return query.order('created_at', { ascending: false });
      case 'follow_up_asc': return query.order('follow_up_date', { ascending: true, nullsFirst: false });
      case 'consumer_asc': return query.order('customer_name', { ascending: true });
      case 'status_asc': return query.order('status', { ascending: true });
      default: return query.order('last_activity_at', { ascending: false });
    }
  }, [customFrom, customTo, debouncedSearch, filterAssigned, filterCreator, filterDate, filterOperator, filterProjectType, filterStatus, role, salesTab, sortBy, user]);

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
  const canManageLeads = role === 'admin';

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

  const activeFilterCount = [
    filterStatus !== 'all',
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
    setFilterStatus('all');
    setFilterCreator('all');
    setFilterAssigned('all');
    setFilterOperator('all');
    setFilterProjectType('all');
    setFilterDate('all');
    setCustomFrom('');
    setCustomTo('');
    setSortBy('latest_activity_desc');
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

  return (
    <div className={isEmbedded ? 'space-y-6' : 'p-4 lg:p-8 max-w-7xl mx-auto space-y-6 animate-in-up'}>
      {!isEmbedded && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold text-display text-foreground tracking-tight">Leads</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManageLeads && (
              <Button variant="outline" size="sm" onClick={() => setIsImportOpen(true)} className="border-primary/20 text-primary hover:bg-primary/5">
                <Upload className="mr-1.5 h-4 w-4" /> Import Leads
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={exportRows} disabled={!filteredRows.length}>
              <Download className="mr-1.5 h-4 w-4" /> Export CSV
            </Button>
            <Button onClick={() => navigate('/leads/new')} size="sm" className="bg-primary hover:bg-primary/95 text-primary-foreground shadow-sm">
              <PhoneCall className="mr-1.5 h-4 w-4" /> Create Lead
            </Button>
          </div>
        </div>
      )}

      {/* Filter and Table Section */}
      <div className="space-y-4">
        {/* Sales Person Queues Toggle */}
        {role === 'sales_person' && (
          <div className="flex bg-muted/40 p-1 rounded-lg border max-w-sm shadow-inner">
            <button
              type="button"
              onClick={() => {
                setSalesTab('my_visits');
                setFilterStatus('all');
              }}
              className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-md transition-all ${
                salesTab === 'my_visits'
                  ? 'bg-background text-foreground shadow'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              My Visits
            </button>
            <button
              type="button"
              onClick={() => {
                setSalesTab('unassigned_visits');
                setFilterStatus('all');
              }}
              className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-md transition-all ${
                salesTab === 'unassigned_visits'
                  ? 'bg-background text-foreground shadow'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Unassigned Visits
            </button>
          </div>
        )}

        {canManageLeads && selectedIds.size > 0 && (
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

              {/* Delete is held apart from Assign at every width — a mis-click here is
                  unrecoverable, and the two must never sit shoulder to shoulder. */}
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
            </div>
          </div>
        )}

        {/* Horizontal Status Quick Filter Bar + Search */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-muted/30 border p-3 rounded-xl">
          {/* Chevron pipeline. Counts come from the loaded rows and the shape
              conveys stage order, which the previous flat chips did not. */}
          <StageBar
            className="flex-1"
            allLabel="All Statuses"
            allCount={total}
            value={filterStatus === 'all' ? null : filterStatus}
            onChange={(v) => setFilterStatus((v ?? 'all') as StatusFilter)}
            items={STAGE_BAR_STAGES.map((stage) => ({
              value: stage.value,
              label: stage.label,
              tone: stage.tone,
              count: stageCounts[stage.value] ?? 0,
            }))}
          />

          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search leads..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8.5 text-xs rounded-lg"
              />
            </div>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8.5 text-xs gap-1">
                  <Filter className="h-3.5 w-3.5" /> Filters {activeFilterCount ? `(${activeFilterCount})` : ''}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[300px] space-y-3 p-4">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Created By</Label>
                  <Select value={filterCreator} onValueChange={setFilterCreator}>
                    <SelectTrigger className="h-8.5 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Staff</SelectItem>
                      {allStaff.map((member) => <SelectItem key={member.user_id} value={member.user_id}>{member.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Assigned To</Label>
                  <Select value={filterAssigned} onValueChange={setFilterAssigned}>
                    <SelectTrigger className="h-8.5 text-xs"><SelectValue /></SelectTrigger>
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
                    <SelectTrigger className="h-8.5 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Operators</SelectItem>
                      {operatorStaff.map((member) => <SelectItem key={member.user_id} value={member.user_id}>{member.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Sort By</Label>
                  <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortKey)}>
                    <SelectTrigger className="h-8.5 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="latest_activity_desc">Latest Activity</SelectItem>
                      <SelectItem value="created_desc">Newest Created</SelectItem>
                      <SelectItem value="follow_up_asc">Next Follow-up</SelectItem>
                      <SelectItem value="consumer_asc">Consumer Name</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full text-xs h-8.5 mt-2" variant="ghost" onClick={resetFilters}>Reset Filters</Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Table of Leads */}
        {loading ? (
          <div className="border rounded-xl p-12 text-center text-muted-foreground bg-card">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
            Loading leads directory...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="border rounded-xl p-12 text-center text-muted-foreground bg-card">
            No leads found matching current filters.
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden bg-card shadow-sm">
            {/* The body scrolls inside a viewport-height box instead of growing
                the page, so the toolbar above and the pager below stay put and
                the column headers remain visible while scrolling. */}
            <div className="overflow-auto max-h-[calc(100vh-22rem)] min-h-[16rem]">
              <table className="w-full text-sm text-left border-collapse text-muted-foreground">
                <thead className="sticky top-0 z-10 text-xs font-mono uppercase bg-muted border-b text-foreground shadow-sm">
                  <tr>
                    {/* K-Number is the primary identifier for a connection, so
                        it leads. The internal lead id is not shown at all. */}
                    {canManageLeads && (
                      <th className="px-3 py-3.5 w-10">
                        <input
                          type="checkbox"
                          aria-label="Select all leads on this page"
                          className="h-4 w-4 cursor-pointer rounded border-border"
                          checked={filteredRows.length > 0 && filteredRows.every((r) => selectedIds.has(r.id))}
                          onChange={(e) =>
                            setSelectedIds(
                              e.target.checked ? new Set(filteredRows.map((r) => r.id)) : new Set()
                            )
                          }
                        />
                      </th>
                    )}
                    <th className="px-4 py-3.5 font-semibold">K Number</th>
                    <th className="px-4 py-3.5 font-semibold">Consumer Details</th>
                    <th className="px-4 py-3.5 font-semibold">Assigned Staff</th>
                    <th className="px-4 py-3.5 font-semibold">Status</th>
                    <th className="px-4 py-3.5 font-semibold">Last Updated</th>
                    <th className="px-4 py-3.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y border-b">
                  {filteredRows.map((lead) => (
                    <tr
                      key={lead.id}
                      className="hover:bg-muted/10 transition-colors cursor-pointer group"
                      onClick={() => navigate(`/leads/${lead.id}`)}
                    >
                      {canManageLeads && (
                        <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${lead.consumerName}`}
                            className="h-4 w-4 cursor-pointer rounded border-border"
                            checked={selectedIds.has(lead.id)}
                            onChange={(e) => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(lead.id);
                                else next.delete(lead.id);
                                return next;
                              });
                            }}
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 text-xs font-mono text-foreground">
                        <div className="flex items-center gap-1">
                          <span className="font-bold">
                            {lead.kNumber || <span className="font-normal text-muted-foreground/60">Not linked</span>}
                          </span>
                          {lead.kNumber && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 rounded-md hover:bg-muted shrink-0"
                              title="Sync with Discom"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSyncKno(lead.id, lead.kNumber);
                              }}
                              disabled={syncingKno === lead.id}
                            >
                              <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${syncingKno === lead.id ? 'animate-spin text-primary' : ''}`} />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 rounded-md hover:bg-muted shrink-0"
                            title={lead.kNumber ? 'Edit K Number' : 'Add K Number'}
                            aria-label={`Edit K Number for ${lead.consumerName}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setKnoTarget(lead);
                              setKnoDraft(lead.kNumber ?? '');
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground truncate max-w-[200px]" title={lead.consumerName}>
                          {lead.consumerName}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 text-xs mt-0.5">
                          <a
                            href={`tel:${lead.mobile}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-primary hover:underline inline-flex items-center gap-1 font-semibold"
                          >
                            <Phone className="h-3 w-3 shrink-0" /> {lead.mobile}
                          </a>
                          {lead.email && (
                            <span className="text-muted-foreground/80 truncate max-w-[150px]" title={lead.email}>
                              • {lead.email}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-foreground text-xs font-medium">{lead.assignedToName}</div>
                        {lead.assignedToRole && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">{statusLabel(lead.assignedToRole)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`${statusColor[lead.status] || statusColor.new} font-medium border-0 px-2 py-0.5 text-[11px]`}>
                          {statusLabel(lead.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="text-foreground">{formatDateTime(lead.lastActivityAt)}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[180px]" title={lead.lastNote}>
                          Note: {lead.lastNote}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {lead.mobile && (
                            <Button
                              asChild
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 text-primary border-primary/20 bg-primary/5 hover:bg-primary hover:text-primary-foreground"
                            >
                              <a href={`tel:${lead.mobile}`} aria-label={`Call ${lead.consumerName}`}>
                                <Phone className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                          {canManageLeads && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              title="Move to Cancelled Bin"
                              aria-label={`Delete ${lead.consumerName}`}
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget(lead); }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                            onClick={() => navigate(`/leads/${lead.id}`)}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && total > 0 && (
          <TablePagination
            entityLabel="leads"
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            table={{
              page,
              pageCount,
              pageSize,
              setPage,
              setPageSize: (size: number) => { setPageSize(size); setPage(0); },
              total,
              rows: filteredRows,
            } as any}
          />
        )}
      </div>

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
    </div>
  );
};

export default AdminLeadsList;
