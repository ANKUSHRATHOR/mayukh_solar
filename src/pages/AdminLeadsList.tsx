import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import StatCard from '@/components/dashboard/StatCard';
import { ArrowUpDown, Calendar as CalIcon, Download, Filter, PhoneCall, Search, UserPlus as AssignIcon, Users, ChevronRight } from 'lucide-react';
import { downloadCsv } from '@/lib/exportCsv';
import { useStickyState } from '@/hooks/useStickyState';
import type { Database } from '@/integrations/supabase/types';

type LeadStatus = Database['public']['Enums']['lead_status'];
type PaymentType = Database['public']['Enums']['payment_type'];
type ProjectStatus = Database['public']['Enums']['project_status'];

type StaffMember = {
  full_name: string;
  is_active: boolean;
  role?: string;
  user_id: string;
};

type LeadRow = {
  assignedToName: string;
  assignedToUserId: string | null;
  consumerName: string;
  createdAt: string;
  createdByName: string;
  createdByUserId: string;
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

const AdminLeadsList = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const requestIdRef = useRef(0);

  const [leadRows, setLeadRows] = useState<LeadRow[]>([]);
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
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const fetchData = useCallback(async (background = false) => {
    const requestId = ++requestIdRef.current;
    if (!background) setLoading(true);

    try {
      const [leadsRes, staffRes, rolesRes, projectsRes, quotationsRes] = await Promise.all([
        supabase.from('leads').select('*').eq('is_in_bin', false).order('updated_at', { ascending: false }),
        supabase.from('staff').select('user_id, full_name, is_active'),
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
          consumerName: lead.customer_name,
          createdAt: lead.created_at,
          createdByName: staffMap[lead.created_by_user_id]?.full_name || 'Unknown user',
          createdByUserId: lead.created_by_user_id,
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
        };
      }));
    } catch (error: any) {
      toast({ title: 'Unable to load leads', description: error.message || 'Please try again.', variant: 'destructive' });
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [toast]);

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
      const q = search.trim().toLowerCase();
      const haystack = [lead.leadCode, lead.consumerName, lead.mobile, lead.createdByName, lead.assignedToName, lead.operatorName, lead.lastNote, lead.latestUpdate].join(' ').toLowerCase();
      const activityDate = new Date(lead.lastActivityAt);

      const statusMatch = filterStatus === 'all'
        || (filterStatus === 'documents_pending' && lead.projectStatus === 'pending_documents')
        || (filterStatus === 'quotation_sent' && lead.hasQuotation)
        || (filterStatus === 'site_visit' && lead.status === 'visited')
        || lead.status === filterStatus;

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

  const assignLead = async (leadId: string, userId: string) => {
    try {
      const { error } = await supabase.from('leads').update({ assigned_to_user_id: userId }).eq('id', leadId);
      if (error) throw error;
      setLeadRows((current) => current.map((lead) => lead.id === leadId ? { ...lead, assignedToUserId: userId, assignedToName: staffDirectory[userId]?.full_name || 'Assigned' } : lead));
      setAssigningId(null);
      toast({ title: 'Lead assigned' });
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
      { header: 'Lead ID', value: (row: LeadRow) => row.leadCode },
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
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-display">All Leads</h1>
          <p className="text-muted-foreground text-sm mt-1">Professional CRM table with latest activity, follow-ups, analytics, and live sync.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportRows} disabled={!filteredRows.length}><Download className="mr-2 h-4 w-4" /> Export CSV/Excel</Button>
          <Button onClick={() => navigate('/leads/new')} className="btn-glow font-semibold"><PhoneCall className="mr-2 h-4 w-4" /> Create Lead</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <StatCard title="Total Leads" value={analytics.total} icon={Users} accent="primary" change="Filtered" changeType="neutral" />
        <StatCard title="Interested" value={analytics.interested} icon={Users} accent="success" change="Warm" changeType="up" />
        <StatCard title="Follow-up" value={analytics.followUp} icon={Users} accent="warning" change="Pending" changeType={analytics.followUp ? 'down' : 'neutral'} />
        <StatCard title="Not Interested" value={analytics.notInterested} icon={Users} accent="destructive" change="Lost" changeType={analytics.notInterested ? 'down' : 'neutral'} />
        <StatCard title="Finalized" value={analytics.finalized} icon={Users} accent="success" change="Closed" changeType={analytics.finalized ? 'up' : 'neutral'} />
        <StatCard title="Converted" value={analytics.converted} icon={Users} accent="info" change="Projects" changeType={analytics.converted ? 'up' : 'neutral'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4">
        <Card className="shadow-card border-border">
          <CardContent className="p-4 flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search lead, mobile, staff, note, update, lead ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline"><Filter className="mr-2 h-4 w-4" /> Filters {activeFilterCount ? `(${activeFilterCount})` : ''}</Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[360px] space-y-3">
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as StatusFilter)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="new">New Lead</SelectItem>
                        <SelectItem value="follow_up">Follow-up</SelectItem>
                        <SelectItem value="interested">Interested</SelectItem>
                        <SelectItem value="not_interested">Not Interested</SelectItem>
                        <SelectItem value="site_visit">Site Visit</SelectItem>
                        <SelectItem value="documents_pending">Documents Pending</SelectItem>
                        <SelectItem value="quotation_sent">Quotation Sent</SelectItem>
                        <SelectItem value="final">Finalized</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Lead Creator</Label>
                    <Select value={filterCreator} onValueChange={setFilterCreator}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Creators</SelectItem>
                        {allStaff.map((member) => <SelectItem key={member.user_id} value={member.user_id}>{member.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Assigned Sales Person</Label>
                    <Select value={filterAssigned} onValueChange={setFilterAssigned}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sales Persons</SelectItem>
                        {salesStaff.map((member) => <SelectItem key={member.user_id} value={member.user_id}>{member.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Assigned Operator</Label>
                    <Select value={filterOperator} onValueChange={setFilterOperator}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Operators</SelectItem>
                        {operatorStaff.map((member) => <SelectItem key={member.user_id} value={member.user_id}>{member.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Project Type</Label>
                      <Select value={filterProjectType} onValueChange={(value) => setFilterProjectType(value as 'all' | PaymentType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="loan">Loan</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Date</Label>
                      <Select value={filterDate} onValueChange={(value) => setFilterDate(value as DateFilter)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Dates</SelectItem>
                          <SelectItem value="today">Today</SelectItem>
                          <SelectItem value="this_week">This Week</SelectItem>
                          <SelectItem value="this_month">This Month</SelectItem>
                          <SelectItem value="custom">Custom Range</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {filterDate === 'custom' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5"><Label>From</Label><Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></div>
                      <div className="space-y-1.5"><Label>To</Label><Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div>
                    </div>
                  )}
                  <div className="flex justify-between pt-2">
                    <Button variant="ghost" onClick={resetFilters}>Reset</Button>
                    <Button variant="outline" onClick={() => void fetchData(true)}>Refresh</Button>
                  </div>
                </PopoverContent>
              </Popover>

              <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortKey)}>
                <SelectTrigger className="w-[210px]"><ArrowUpDown className="mr-2 h-4 w-4 text-muted-foreground" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest_activity_desc">Latest activity</SelectItem>
                  <SelectItem value="created_desc">Newest created</SelectItem>
                  <SelectItem value="follow_up_asc">Next follow-up</SelectItem>
                  <SelectItem value="consumer_asc">Consumer name</SelectItem>
                  <SelectItem value="status_asc">Status</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card border-border">
          <CardHeader className="pb-3"><CardTitle className="text-base">Staff-wise Analytics</CardTitle></CardHeader>
          <CardContent>
            {!staffAnalytics.length ? <p className="text-sm text-muted-foreground">No staff activity in this filter.</p> : (
              <div className="space-y-3">
                {staffAnalytics.map((item) => (
                  <div key={item.name} className="rounded-lg border border-border px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-foreground truncate">{item.name}</p>
                      <Badge variant="outline">{item.ratio}%</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                      <div><span className="block font-medium text-foreground">{item.created}</span>Created</div>
                      <div><span className="block font-medium text-foreground">{item.assigned}</span>Assigned</div>
                      <div><span className="block font-medium text-foreground">{item.converted}</span>Converted</div>
                      <div><span className="block font-medium text-foreground">{item.followUps}</span>Follow-up</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base">Lead Pipeline</CardTitle>
            <p className="text-sm text-muted-foreground">{filteredRows.length} lead(s) visible • realtime sync enabled</p>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm py-12 text-center">Loading lead pipeline...</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-muted-foreground text-sm py-12 text-center">No leads match the current filters.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredRows.map((lead) => (
                <div
                  key={lead.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/leads/${lead.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/leads/${lead.id}`); }}
                  className="group relative rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-elevated hover:border-primary/40 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-mono">#{lead.leadCode}</p>
                      <p className="font-semibold text-foreground truncate mt-0.5">{lead.consumerName}</p>
                      <a
                        href={`tel:${lead.mobile}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-0.5"
                      >
                        <PhoneCall className="h-3 w-3" /> {lead.mobile}
                      </a>
                    </div>
                    <Badge className={`shrink-0 ${statusColor[lead.status] || statusColor.new}`}>{statusLabel(lead.status)}</Badge>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <div>
                      <p className="text-muted-foreground">Created by</p>
                      <p className="font-medium text-foreground truncate">{lead.createdByName}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Assigned</p>
                      <p className="font-medium text-foreground truncate">{lead.assignedToName}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Type</p>
                      <p className="font-medium text-foreground">{lead.projectType ? statusLabel(lead.projectType) : 'Lead'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Operator</p>
                      <p className="font-medium text-foreground truncate">{lead.operatorName}</p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-md bg-muted/40 p-2.5 text-xs">
                    <p className="text-muted-foreground">Latest note</p>
                    <p className="text-foreground line-clamp-2 mt-0.5">{lead.lastNote}</p>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalIcon className="h-3 w-3" />
                      Updated {formatDateTime(lead.lastActivityAt)}
                    </span>
                    {lead.nextFollowUpDate && (
                      <span className="rounded-full bg-warning/10 text-warning-foreground border border-warning/30 px-2 py-0.5">
                        Follow-up {formatDate(lead.nextFollowUpDate)}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                    {assigningId === lead.id ? (
                      <Select onValueChange={(value) => assignLead(lead.id, value)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Assign sales..." /></SelectTrigger>
                        <SelectContent>
                          {salesStaff.map((member) => <SelectItem key={member.user_id} value={member.user_id}>{member.full_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setAssigningId(lead.id)}>
                        <AssignIcon className="mr-1.5 h-3.5 w-3.5" /> Assign
                      </Button>
                    )}
                    <span className="inline-flex items-center text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      Open <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLeadsList;
