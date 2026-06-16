import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StatCard from '@/components/dashboard/StatCard';
import {
  ClipboardCheck, FileSearch, AlertTriangle, Package,
  CheckCircle2, Clock, Search, ChevronRight, Truck, Wrench, X
} from 'lucide-react';

import type { Database } from '@/integrations/supabase/types';

type ProjectStatus = Database['public']['Enums']['project_status'];

interface ProjectRow {
  id: string;
  project_code: string;
  capacity_kw: number;
  status: ProjectStatus;
  payment_type: string;
  panel_brand: string;
  panel_qty: number;
  panel_watt: number;
  inverter_brand: string;
  final_amount: number;
  k_number: string | null;
  consumer_name: string | null;
  created_at: string;
  updated_at: string;
  lead_id: string;
  documents_submitted_by_sales: boolean;
  loan_bank: string | null;
  assigned_sales_person_id: string | null;
  lead_source: string | null;
  sales_person_name: string | null;
}

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
      active
        ? 'bg-primary text-primary-foreground border-primary'
        : 'bg-card text-foreground border-border hover:border-primary/40 hover:bg-accent/40'
    }`}
  >
    {children}
  </button>
);

const statusLabels: Record<ProjectStatus, string> = {
  pending_documents: 'Pending Documents',
  pending_operator_review: 'Pending Review',
  registration_pending: 'Registration Pending',
  registration_done: 'Registration Done',
  loan_process: 'Loan Process',
  loan_done: 'Loan Done',
  cash_file: 'Cash File',
  material_ordered: 'Material Ordered',
  material_dispatched: 'Material Dispatched',
  material_delivered: 'Material Delivered',
  installation_pending: 'Installation Pending',
  installation_done: 'Installation Done',
  wiring_pending: 'Wiring Pending',
  wiring_done: 'Wiring Done',
  net_metering_submitted: 'Net Metering Submitted',
  inspection_scheduled: 'Inspection Scheduled',
  inspection_completed: 'Inspection Completed',
  inspection_failed: 'Inspection Failed',
  net_meter_installed: 'Net Meter Installed',
  project_completed: 'Project Completed',
};

const statusColors: Record<string, string> = {
  pending_operator_review: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  registration_pending: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  registration_done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  loan_process: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  loan_done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  cash_file: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  material_ordered: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  material_dispatched: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  material_delivered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  installation_pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  installation_done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  project_completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
};

type TabFilter = 'review' | 'registration' | 'finance' | 'material' | 'installation' | 'netmetering' | 'completed' | 'all';

const tabFilters: Record<TabFilter, ProjectStatus[]> = {
  review: ['pending_operator_review'],
  registration: ['registration_pending', 'registration_done'],
  finance: ['loan_process', 'loan_done', 'cash_file'],
  material: ['material_ordered', 'material_dispatched', 'material_delivered'],
  installation: ['installation_pending', 'installation_done', 'wiring_pending', 'wiring_done'],
  netmetering: ['net_metering_submitted', 'inspection_scheduled', 'inspection_completed', 'inspection_failed', 'net_meter_installed'],
  completed: ['project_completed'],
  all: [],
};

const OperatorDashboard = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabFilter>('review');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'this_month'>('all');
  const [salesFilter, setSalesFilter] = useState<string>('all');
  const [progressFilter, setProgressFilter] = useState<'all' | 'in_progress' | 'finalized'>('all');

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const [projRes, staffRes] = await Promise.all([
      supabase
        .from('projects')
        .select('*, leads(source, customer_name)')
        .order('updated_at', { ascending: false }),
      supabase.from('staff').select('user_id, full_name'),
    ]);
    const rows: ProjectRow[] = ((projRes.data as any[]) || []).map((p: any) => ({
      ...p,
      lead_source: p.leads?.source || null,
      sales_person_name: null,
    }));
    setProjects(rows);
    const map: Record<string, string> = {};
    (staffRes.data || []).forEach((s: any) => { map[s.user_id] = s.full_name; });
    setStaffMap(map);
    setLoading(false);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  // Sales persons that appear in current project list (for chip filter)
  const salesInData = useMemo(() => {
    const ids = new Set<string>();
    projects.forEach(p => { if (p.assigned_sales_person_id) ids.add(p.assigned_sales_person_id); });
    return Array.from(ids)
      .map(id => ({ id, name: staffMap[id] || 'Staff' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, staffMap]);

  const filtered = projects.filter(p => {
    const statuses = tabFilters[activeTab];
    if (statuses.length > 0 && !statuses.includes(p.status)) return false;
    if (sourceFilter !== 'all' && p.lead_source !== sourceFilter) return false;
    if (salesFilter !== 'all' && p.assigned_sales_person_id !== salesFilter) return false;
    if (progressFilter === 'finalized' && p.status !== 'project_completed') return false;
    if (progressFilter === 'in_progress' && p.status === 'project_completed') return false;
    if (dateFilter !== 'all') {
      const now = new Date();
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const ts = new Date(p.updated_at).getTime();
      if (dateFilter === 'today' && ts < startToday) return false;
      if (dateFilter === 'this_month' && ts < startMonth) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        p.project_code.toLowerCase().includes(q) ||
        (p.k_number || '').toLowerCase().includes(q) ||
        (p.consumer_name || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeFilterCount =
    (sourceFilter !== 'all' ? 1 : 0) +
    (dateFilter !== 'all' ? 1 : 0) +
    (salesFilter !== 'all' ? 1 : 0) +
    (progressFilter !== 'all' ? 1 : 0);

  const clearFilters = () => {
    setSourceFilter('all');
    setDateFilter('all');
    setSalesFilter('all');
    setProgressFilter('all');
  };

  const labelize = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());


  const reviewCount = projects.filter(p => p.status === 'pending_operator_review').length;
  const regCount = projects.filter(p => ['registration_pending', 'registration_done'].includes(p.status)).length;
  const financeCount = projects.filter(p => ['loan_process', 'loan_done', 'cash_file'].includes(p.status)).length;
  const materialCount = projects.filter(p => ['material_ordered', 'material_dispatched', 'material_delivered'].includes(p.status)).length;
  const installCount = projects.filter(p => ['installation_pending', 'installation_done', 'wiring_pending', 'wiring_done'].includes(p.status)).length;
  const netMeterCount = projects.filter(p => ['net_metering_submitted', 'inspection_scheduled', 'inspection_completed', 'inspection_failed', 'net_meter_installed'].includes(p.status)).length;
  const completedCount = projects.filter(p => p.status === 'project_completed').length;

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Operator Dashboard</h1>
        <p className="text-muted-foreground text-sm">Manage projects, review documents, and track progress</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard onClick={() => setActiveTab('review')} title="Pending Review" value={reviewCount} icon={FileSearch} change={reviewCount > 0 ? 'Needs attention' : 'All clear'} />
        <StatCard onClick={() => setActiveTab('installation')} title="Installation" value={installCount} icon={Wrench} />
        <StatCard onClick={() => setActiveTab('netmetering')} title="Net Metering" value={netMeterCount} icon={ClipboardCheck} />
        <StatCard onClick={() => setActiveTab('completed')} title="Completed" value={completedCount} icon={CheckCircle2} />
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search project code, K number..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
      </div>

      {/* Filter chips */}
      <Card className="shadow-card border-border">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Filters</p>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                <X className="h-3 w-3 mr-1" /> Clear ({activeFilterCount})
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground">Progress</p>
            <div className="flex flex-wrap gap-1.5">
              {([
                { v: 'all', l: 'All' },
                { v: 'in_progress', l: 'In Progress' },
                { v: 'finalized', l: 'Finalized' },
              ] as const).map(c => (
                <Chip key={c.v} active={progressFilter === c.v} onClick={() => setProgressFilter(c.v)}>{c.l}</Chip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground">Date Range</p>
            <div className="flex flex-wrap gap-1.5">
              {([
                { v: 'all', l: 'All Time' },
                { v: 'today', l: 'Today' },
                { v: 'this_month', l: 'This Month' },
              ] as const).map(c => (
                <Chip key={c.v} active={dateFilter === c.v} onClick={() => setDateFilter(c.v)}>{c.l}</Chip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground">Lead Source</p>
            <div className="flex flex-wrap gap-1.5">
              {['all', 'phone_call', 'walk_in', 'reference', 'camp', 'online'].map(s => (
                <Chip key={s} active={sourceFilter === s} onClick={() => setSourceFilter(s)}>
                  {s === 'all' ? 'All' : labelize(s)}
                </Chip>
              ))}
            </div>
          </div>

          {salesInData.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground">Sales Person</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={salesFilter === 'all'} onClick={() => setSalesFilter('all')}>All</Chip>
                {salesInData.map(s => (
                  <Chip key={s.id} active={salesFilter === s.id} onClick={() => setSalesFilter(s.id)}>{s.name}</Chip>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabFilter)}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="review" className="gap-1.5">
            <FileSearch className="h-4 w-4" /> Review
            {reviewCount > 0 && <Badge variant="destructive" className="ml-1 text-xs px-1.5">{reviewCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="registration" className="gap-1.5">
            <ClipboardCheck className="h-4 w-4" /> Registration
          </TabsTrigger>
          <TabsTrigger value="finance" className="gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Finance
          </TabsTrigger>
          <TabsTrigger value="material" className="gap-1.5">
            <Package className="h-4 w-4" /> Material
          </TabsTrigger>
          <TabsTrigger value="installation" className="gap-1.5">
            <Wrench className="h-4 w-4" /> Install/Wire
          </TabsTrigger>
          <TabsTrigger value="netmetering" className="gap-1.5">
            <ClipboardCheck className="h-4 w-4" /> Net Meter
            {netMeterCount > 0 && <Badge variant="secondary" className="ml-1 text-xs px-1.5">{netMeterCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Done
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-1.5">All</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading projects...</div>
          ) : filtered.length === 0 ? (
            <Card className="shadow-card"><CardContent className="py-12 text-center text-muted-foreground">
              No projects in this stage
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {filtered.map(project => (
                <Card
                  key={project.id}
                  className="shadow-card hover:shadow-elevated transition-shadow cursor-pointer"
                  onClick={() => navigate(`/operator/projects/${project.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-foreground">{project.project_code}</p>
                          <Badge className={statusColors[project.status] || 'bg-muted text-muted-foreground'}>
                            {statusLabels[project.status]}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-muted-foreground">
                          {project.consumer_name && <span>{project.consumer_name}</span>}
                          <span>{project.capacity_kw} kW</span>
                          <span>{project.payment_type === 'loan' ? '🏦 Loan' : '💵 Cash'}</span>
                          {project.k_number && <span>K: {project.k_number}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Updated {new Date(project.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OperatorDashboard;
