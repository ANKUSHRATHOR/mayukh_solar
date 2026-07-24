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
import { useToast } from '@/hooks/use-toast';
import { ArrowUpDown, Calendar as CalIcon, Download, Filter, PhoneCall, Search, Users, ChevronRight, Upload, Phone, RefreshCw } from 'lucide-react';
import { downloadCsv } from '@/lib/exportCsv';
import { useStickyState } from '@/hooks/useStickyState';
import type { Database } from '@/integrations/supabase/types';
import LeadImportWizard from '@/components/leads/LeadImportWizard';
import { fetchConsumerDetails } from '@/lib/discom';
import StageBar from '@/components/common/StageBar';
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

const AdminLeadsList = ({ isEmbedded = false }: { isEmbedded?: boolean }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const requestIdRef = useRef(0);

  const [leadRows, setLeadRows] = useState<LeadRow[]>([]);
  const [syncingKno, setSyncingKno] = useState<string | null>(null);
  const [salesTab, setSalesTab] = useState<'my_visits' | 'unassigned_visits'>('my_visits');
  const { user, role } = useAuth();
  const [staffDirectory, setStaffDirectory] = useState<Record<string, StaffMember>>({});
  const [salesStaff, setSalesStaff] = useState<StaffMember[]>([]);
  const [operatorStaff, setOperatorStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useStickyState<string>('admin-leads:search', '');
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

  const kanbanColumns: { status: LeadStatus; label: string; color: string }[] = [
    { status: 'new', label: 'New', color: 'border-t-2 border-t-sky-500' },
    { status: 'visited', label: 'Site Visit', color: 'border-t-2 border-t-purple-500' },
    { status: 'follow_up', label: 'Follow-up', color: 'border-t-2 border-t-amber-500' },
    { status: 'interested', label: 'Interested', color: 'border-t-2 border-t-emerald-500' },
    { status: 'final', label: 'Finalized', color: 'border-t-2 border-t-rose-500' },
  ];

  const fetchData = useCallback(async (background = false) => {
    const requestId = ++requestIdRef.current;
    if (!background) setLoading(true);

    try {
      const [leadsRes, staffRes, rolesRes, projectsRes, quotationsRes] = await Promise.all([
        supabase.from('leads').select('*').eq('is_in_bin', false).order('updated_at', { ascending: false }),
        supabase.from('staff').select('user_id, full_name, mobile, is_active'),
        supabase.from('user_roles').select('user_id, role'),
        supabase.from('projects').select('id, lead_id, assigned_operator_id, payment_type, status, updated_at').not('lead_id', 'is', null),
        supabase.from('quotations').select('project_id, created_at').not('project_id', 'is', null),
      ]);

      if (leadsRes.error) throw leadsRes.error;
      if (staffRes.error) throw staffRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (projectsRes.error) throw projectsRes.error;
      if (quotationsRes.error) throw quotationsRes.error;

      const leadIds = (leadsRes.data || []).map((lead) => lead.id);
      const siteVisitsRes = leadIds.length
        ? await supabase.from('site_visits').select('lead_id, staff_id, visit_date, visit_notes, status_updated_to').in('lead_id', leadIds).order('visit_date', { ascending: false })
        : { data: [], error: null };

      if (siteVisitsRes.error) throw siteVisitsRes.error;
      if (requestId !== requestIdRef.current) return;

      const rolesByUser = new Map((rolesRes.data || []).map((item) => [item.user_id, item.role]));
      const staffMap = Object.fromEntries(
        (staffRes.data || []).map((item) => [item.user_id, { ...item, role: rolesByUser.get(item.user_id) }]),
      ) as Record<string, StaffMember>;

      const latestVisitByLead = new Map<string, (typeof siteVisitsRes.data)[number]>();
      for (const visit of siteVisitsRes.data || []) {
        if (!latestVisitByLead.has(visit.lead_id)) latestVisitByLead.set(visit.lead_id, visit);
      }

      const latestProjectByLead = new Map<string, (typeof projectsRes.data)[number]>();
      for (const project of projectsRes.data || []) {
        const current = latestProjectByLead.get(project.lead_id!);
        if (!current || new Date(project.updated_at || 0).getTime() > new Date(current.updated_at || 0).getTime()) {
          latestProjectByLead.set(project.lead_id!, project);
        }
      }

      const quotationProjects = new Set((quotationsRes.data || []).map((quotation) => quotation.project_id));

      setStaffDirectory(staffMap);
      setSalesStaff(Object.values(staffMap).filter((item) => item.role === 'sales_person' && item.is_active).sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setOperatorStaff(Object.values(staffMap).filter((item) => item.role === 'operator' && item.is_active).sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setLeadRows((leadsRes.data || []).map((lead) => {
        const latestVisit = latestVisitByLead.get(lead.id);
        const project = latestProjectByLead.get(lead.id);
        const hasQuotation = project?.id ? quotationProjects.has(project.id) : false;

        return {
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
          hasQuotation,
          id: lead.id,
          lastActivityAt: latestVisit?.visit_date || project?.updated_at || lead.updated_at || lead.created_at,
          lastNote: latestVisit?.visit_notes?.trim() || lead.notes?.trim() || '—',
          latestUpdate: latestVisit?.status_updated_to
            ? statusLabel(latestVisit.status_updated_to)
            : project?.status === 'pending_documents'
              ? 'Documents Pending'
              : hasQuotation
                ? 'Quotation Sent'
                : statusLabel(lead.status),
          latestUpdatedBy: latestVisit?.staff_id ? staffMap[latestVisit.staff_id]?.full_name || 'Staff member' : 'System',
          leadCode: lead.id.slice(0, 8).toUpperCase(),
          mobile: lead.mobile,
          nextFollowUpDate: lead.follow_up_date,
          operatorName: project?.assigned_operator_id ? staffMap[project.assigned_operator_id]?.full_name || 'Unassigned' : 'Unassigned',
          operatorUserId: project?.assigned_operator_id || null,
          projectStatus: project?.status || null,
          projectType: project?.payment_type || null,
          status: lead.status,
          kNumber: lead.k_number,
          email: lead.email,
        };
      }));
    } catch (error: any) {
      toast({ title: 'Unable to load leads', description: error.message || 'Please try again.', variant: 'destructive' });
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [toast]);

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

  useEffect(() => {
    const channel = supabase
      .channel('admin-leads-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => void fetchData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_visits' }, () => void fetchData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => void fetchData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotations' }, () => void fetchData(true))
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const allStaff = useMemo(() => Object.values(staffDirectory).sort((a, b) => a.full_name.localeCompare(b.full_name)), [staffDirectory]);

  const filteredRows = useMemo(() => {
    const fromDate = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
    const toDate = customTo ? new Date(`${customTo}T23:59:59`) : null;

    return leadRows.filter((lead) => {
      // 1. Role-based filtering for sales persons
      if (role === 'sales_person') {
        if (salesTab === 'my_visits') {
          // My leads: assigned to me OR created by me
          if (lead.assignedToUserId !== user?.id && lead.createdByUserId !== user?.id) {
            return false;
          }
        } else if (salesTab === 'unassigned_visits') {
          // Unassigned visits: no sales person assigned AND there is an appointment scheduled
          if (lead.assignedToUserId !== null || !lead.nextFollowUpDate) {
            return false;
          }
        }
      }

      const q = search.trim().toLowerCase();
      const haystack = [lead.leadCode, lead.consumerName, lead.mobile, lead.createdByName, lead.assignedToName, lead.operatorName, lead.lastNote, lead.latestUpdate].join(' ').toLowerCase();
      const activityDate = new Date(lead.lastActivityAt);

      const statusMatch = matchesStatusFilter(lead, filterStatus);

      const dateMatch = filterDate === 'all'
        || (filterDate === 'today' && activityDate >= startOfToday())
        || (filterDate === 'this_week' && activityDate >= startOfWeek())
        || (filterDate === 'this_month' && activityDate >= startOfMonth())
        || (filterDate === 'custom' && (!fromDate || activityDate >= fromDate) && (!toDate || activityDate <= toDate));

      return (!q || haystack.includes(q))
        && statusMatch
        && (filterCreator === 'all' || lead.createdByUserId === filterCreator)
        && (filterAssigned === 'all' || lead.assignedToUserId === filterAssigned)
        && (filterOperator === 'all' || lead.operatorUserId === filterOperator)
        && (filterProjectType === 'all' || lead.projectType === filterProjectType)
        && dateMatch;
    }).sort((a, b) => {
      switch (sortBy) {
        case 'created_desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'follow_up_asc':
          return (a.nextFollowUpDate ? new Date(a.nextFollowUpDate).getTime() : Number.POSITIVE_INFINITY)
            - (b.nextFollowUpDate ? new Date(b.nextFollowUpDate).getTime() : Number.POSITIVE_INFINITY);
        case 'consumer_asc':
          return a.consumerName.localeCompare(b.consumerName);
        case 'status_asc':
          return statusLabel(a.status).localeCompare(statusLabel(b.status));
        case 'latest_activity_desc':
        default:
          return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
      }
    });
  }, [customFrom, customTo, filterAssigned, filterCreator, filterDate, filterOperator, filterProjectType, filterStatus, leadRows, search, sortBy]);

  const kanbanFilteredRows = useMemo(() => {
    const fromDate = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
    const toDate = customTo ? new Date(`${customTo}T23:59:59`) : null;

    return leadRows.filter((lead) => {
      const q = search.trim().toLowerCase();
      const haystack = [lead.leadCode, lead.consumerName, lead.mobile, lead.createdByName, lead.assignedToName, lead.operatorName, lead.lastNote, lead.latestUpdate].join(' ').toLowerCase();
      const activityDate = new Date(lead.lastActivityAt);

      const dateMatch = filterDate === 'all'
        || (filterDate === 'today' && activityDate >= startOfToday())
        || (filterDate === 'this_week' && activityDate >= startOfWeek())
        || (filterDate === 'this_month' && activityDate >= startOfMonth())
        || (filterDate === 'custom' && (!fromDate || activityDate >= fromDate) && (!toDate || activityDate <= toDate));

      return (!q || haystack.includes(q))
        && (filterCreator === 'all' || lead.createdByUserId === filterCreator)
        && (filterAssigned === 'all' || lead.assignedToUserId === filterAssigned)
        && (filterOperator === 'all' || lead.operatorUserId === filterOperator)
        && (filterProjectType === 'all' || lead.projectType === filterProjectType)
        && dateMatch;
    }).sort((a, b) => {
      switch (sortBy) {
        case 'created_desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'follow_up_asc':
          return (a.nextFollowUpDate ? new Date(a.nextFollowUpDate).getTime() : Number.POSITIVE_INFINITY)
            - (b.nextFollowUpDate ? new Date(b.nextFollowUpDate).getTime() : Number.POSITIVE_INFINITY);
        case 'consumer_asc':
          return a.consumerName.localeCompare(b.consumerName);
        case 'status_asc':
          return statusLabel(a.status).localeCompare(statusLabel(b.status));
        case 'latest_activity_desc':
        default:
          return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
      }
    });
  }, [customFrom, customTo, filterAssigned, filterCreator, filterDate, filterOperator, filterProjectType, leadRows, search, sortBy]);

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

  const updateCreator = async (leadId: string, userId: string) => {
    try {
      const { error } = await supabase.from('leads').update({ created_by_user_id: userId }).eq('id', leadId);
      if (error) throw error;
      const staff = staffDirectory[userId];
      setLeadRows((current) => current.map((lead) => lead.id === leadId ? {
        ...lead,
        createdByUserId: userId,
        createdByName: staff?.full_name || 'Updated',
        createdByMobile: staff?.mobile || null,
        createdByRole: staff?.role || null,
      } : lead));
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
            <Button variant="outline" size="sm" onClick={() => setIsImportOpen(true)} className="border-primary/20 text-primary hover:bg-primary/5">
              <Upload className="mr-1.5 h-4 w-4" /> Import Leads
            </Button>
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

        {selectedIds.size > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-foreground">
              {selectedIds.size} lead{selectedIds.size > 1 ? 's' : ''} selected
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={bulkAssignee} onValueChange={setBulkAssignee}>
                <SelectTrigger className="h-9 w-[220px] text-sm">
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
              <Button size="sm" onClick={bulkAssign} disabled={!bulkAssignee || bulkAssigning}>
                {bulkAssigning ? 'Assigning…' : 'Assign'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                Clear
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
            allCount={leadRows.length}
            value={filterStatus === 'all' ? null : filterStatus}
            onChange={(v) => setFilterStatus((v ?? 'all') as StatusFilter)}
            items={STAGE_BAR_STAGES.map((stage) => ({
              value: stage.value,
              label: stage.label,
              tone: stage.tone,
              count: leadRows.filter((r) => matchesStatusFilter(r, stage.value as StatusFilter)).length,
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
                  <Label className="text-xs font-bold">Assigned Sales Person</Label>
                  <Select value={filterAssigned} onValueChange={setFilterAssigned}>
                    <SelectTrigger className="h-8.5 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sales</SelectItem>
                      {salesStaff.map((member) => <SelectItem key={member.user_id} value={member.user_id}>{member.full_name}</SelectItem>)}
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse text-muted-foreground">
                <thead className="text-xs font-mono uppercase bg-muted/40 border-b text-foreground">
                  <tr>
                    {/* K-Number is the primary identifier for a connection, so
                        it leads. The internal lead id is not shown at all. */}
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
      </div>

      <LeadImportWizard
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImportComplete={() => void fetchData(true)}
      />
    </div>
  );
};

export default AdminLeadsList;
