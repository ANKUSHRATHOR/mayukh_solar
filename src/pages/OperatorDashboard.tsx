import { useEffect, useState, useCallback } from 'react';
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
  CheckCircle2, Clock, Search, ChevronRight, Truck, Wrench
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
}

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

type TabFilter = 'review' | 'registration' | 'finance' | 'material' | 'all';

const tabFilters: Record<TabFilter, ProjectStatus[]> = {
  review: ['pending_operator_review'],
  registration: ['registration_pending', 'registration_done'],
  finance: ['loan_process', 'loan_done', 'cash_file'],
  material: ['material_ordered', 'material_dispatched', 'material_delivered'],
  all: [],
};

const OperatorDashboard = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabFilter>('review');

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false });
    setProjects((data as ProjectRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const filtered = projects.filter(p => {
    const statuses = tabFilters[activeTab];
    if (statuses.length > 0 && !statuses.includes(p.status)) return false;
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

  const reviewCount = projects.filter(p => p.status === 'pending_operator_review').length;
  const regCount = projects.filter(p => ['registration_pending', 'registration_done'].includes(p.status)).length;
  const financeCount = projects.filter(p => ['loan_process', 'loan_done', 'cash_file'].includes(p.status)).length;
  const materialCount = projects.filter(p => ['material_ordered', 'material_dispatched', 'material_delivered'].includes(p.status)).length;

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Operator Dashboard</h1>
        <p className="text-muted-foreground text-sm">Manage projects, review documents, and track progress</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Pending Review" value={reviewCount} icon={FileSearch} change={reviewCount > 0 ? 'Needs attention' : 'All clear'} />
        <StatCard title="Registration" value={regCount} icon={ClipboardCheck} />
        <StatCard title="Finance Stage" value={financeCount} icon={AlertTriangle} />
        <StatCard title="Material Stage" value={materialCount} icon={Package} />
      </div>

      {/* Tabs + Search */}
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
