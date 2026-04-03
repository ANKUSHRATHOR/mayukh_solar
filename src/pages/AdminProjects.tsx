import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Search, Briefcase, Filter, UserCog } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import StatCard from '@/components/dashboard/StatCard';
import type { Database } from '@/integrations/supabase/types';

type ProjectStatus = Database['public']['Enums']['project_status'];

const STATUS_LABELS: Record<ProjectStatus, string> = {
  pending_documents: 'Pending Documents',
  pending_operator_review: 'Operator Review',
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

const STATUS_COLORS: Record<string, string> = {
  pending_documents: 'bg-yellow-100 text-yellow-800',
  project_completed: 'bg-green-100 text-green-800',
  inspection_failed: 'bg-red-100 text-red-800',
};

const AdminProjects = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [assignDialog, setAssignDialog] = useState<{ projectId: string; type: 'welder' | 'electrician' } | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [projectsRes, staffRes] = await Promise.all([
      supabase.from('projects').select('*, leads(customer_name, mobile, district)').order('created_at', { ascending: false }),
      supabase.from('staff').select('user_id, full_name').eq('is_active', true),
    ]);
    setProjects(projectsRes.data || []);
    setStaff(staffRes.data || []);
    setLoading(false);
  };

  const handleAssign = async () => {
    if (!assignDialog || !selectedStaffId) return;
    const field = assignDialog.type === 'welder' ? 'assigned_welder_id' : 'assigned_electrician_id';
    const { error } = await supabase.from('projects').update({ [field]: selectedStaffId }).eq('id', assignDialog.projectId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Assigned successfully' });
      fetchData();
    }
    setAssignDialog(null);
    setSelectedStaffId('');
  };

  const handleStatusOverride = async (projectId: string, newStatus: ProjectStatus) => {
    const updateData: any = { status: newStatus };
    if (newStatus === 'project_completed') updateData.completed_at = new Date().toISOString();
    const { error } = await supabase.from('projects').update(updateData).eq('id', projectId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Status updated' });
      fetchData();
    }
  };

  const filtered = projects.filter((p) => {
    const matchSearch = search === '' ||
      p.project_code?.toLowerCase().includes(search.toLowerCase()) ||
      p.leads?.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.k_number?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalRevenue = projects.reduce((s, p) => s + Number(p.final_amount || 0), 0);
  const completed = projects.filter(p => p.status === 'project_completed').length;
  const inProgress = projects.filter(p => p.status !== 'project_completed').length;

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">All Projects</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage all projects across every stage</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total Projects" value={String(projects.length)} icon={Briefcase} change="" changeType="neutral" />
        <StatCard title="In Progress" value={String(inProgress)} icon={Filter} change="" changeType="neutral" />
        <StatCard title="Completed" value={String(completed)} icon={Briefcase} change={`₹${(totalRevenue / 100000).toFixed(1)}L revenue`} changeType="up" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search project code, customer, K number..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">No projects found.</CardContent></Card>
        ) : (
          filtered.map((p) => (
            <Card key={p.id} className="shadow-card border-border">
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-foreground">{p.project_code}</span>
                      <Badge className={STATUS_COLORS[p.status] || 'bg-accent text-accent-foreground'}>
                        {STATUS_LABELS[p.status as ProjectStatus] || p.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {p.leads?.customer_name} — {p.leads?.district} | {p.capacity_kw} kW | ₹{Number(p.final_amount).toLocaleString()}
                    </p>
                    {p.k_number && <p className="text-xs text-muted-foreground">K#: {p.k_number}</p>}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" onClick={() => { setAssignDialog({ projectId: p.id, type: 'welder' }); setSelectedStaffId(p.assigned_welder_id || ''); }}>
                          <UserCog className="h-3 w-3 mr-1" /> Welder
                        </Button>
                      </DialogTrigger>
                    </Dialog>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" onClick={() => { setAssignDialog({ projectId: p.id, type: 'electrician' }); setSelectedStaffId(p.assigned_electrician_id || ''); }}>
                          <UserCog className="h-3 w-3 mr-1" /> Electrician
                        </Button>
                      </DialogTrigger>
                    </Dialog>

                    <Select value={p.status} onValueChange={(val) => handleStatusOverride(p.id, val as ProjectStatus)}>
                      <SelectTrigger className="w-40 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${p.id}/documents`)}>
                      Docs
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Assign Dialog */}
      <Dialog open={!!assignDialog} onOpenChange={(o) => { if (!o) { setAssignDialog(null); setSelectedStaffId(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign {assignDialog?.type === 'welder' ? 'Welder' : 'Electrician'}</DialogTitle>
          </DialogHeader>
          <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
            <SelectTrigger>
              <SelectValue placeholder="Select staff member" />
            </SelectTrigger>
            <SelectContent>
              {staff.map((s) => (
                <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleAssign} disabled={!selectedStaffId} className="gradient-primary text-primary-foreground">
            Assign
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminProjects;
