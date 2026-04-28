import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, Search, Briefcase, Filter, UserCog, Pencil, Trash2, FileText } from 'lucide-react';
import QuotationButton from '@/components/projects/QuotationButton';
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
  const [projectToDelete, setProjectToDelete] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
    const updateData = field === 'assigned_welder_id'
      ? { assigned_welder_id: selectedStaffId }
      : { assigned_electrician_id: selectedStaffId };
    const { error } = await supabase.from('projects').update(updateData).eq('id', assignDialog.projectId);
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

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    setDeletingId(projectToDelete.id);

    try {
      const { data: storedFiles } = await supabase.storage
        .from('project-documents')
        .list(projectToDelete.id);

      if (storedFiles?.length) {
        const filePaths = storedFiles.map((file) => `${projectToDelete.id}/${file.name}`);
        await supabase.storage.from('project-documents').remove(filePaths);
      }

      await Promise.all([
        supabase.from('documents').delete().eq('project_id', projectToDelete.id),
        supabase.from('quotations').delete().eq('project_id', projectToDelete.id),
        supabase.from('serial_numbers').delete().eq('project_id', projectToDelete.id),
      ]);

      const { error } = await supabase.from('projects').delete().eq('id', projectToDelete.id);
      if (error) throw error;

      await supabase
        .from('leads')
        .update({
          status: 'cancelled',
          is_in_bin: true,
          cancelled_reason: 'other',
          cancelled_reason_other: 'Installation refused after finalization',
        })
        .eq('id', projectToDelete.lead_id);

      toast({ title: 'Project deleted', description: 'The project was removed and the lead moved to the cancelled bin.' });
      setProjectToDelete(null);
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
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
            <Card key={p.id} className="overflow-hidden border-border bg-card shadow-card transition-shadow hover:shadow-elevated">
              <CardContent className="p-0">
                <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0 space-y-4 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project</p>
                        <h2 className="break-words text-xl font-extrabold leading-tight text-foreground sm:text-2xl">
                          {p.project_code}
                        </h2>
                      </div>
                      <Badge className={`${STATUS_COLORS[p.status] || 'bg-accent text-accent-foreground'} w-fit rounded-full px-3 py-1 text-xs font-semibold`}>
                        {STATUS_LABELS[p.status as ProjectStatus] || p.status}
                      </Badge>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-md border border-border bg-muted/30 p-3">
                        <p className="text-xs font-medium text-muted-foreground">Customer</p>
                        <p className="mt-1 truncate text-sm font-semibold text-foreground" title={p.leads?.customer_name || ''}>
                          {p.leads?.customer_name || '—'}
                        </p>
                      </div>
                      <div className="rounded-md border border-border bg-muted/30 p-3">
                        <p className="text-xs font-medium text-muted-foreground">District</p>
                        <p className="mt-1 truncate text-sm font-semibold text-foreground" title={p.leads?.district || ''}>
                          {p.leads?.district || '—'}
                        </p>
                      </div>
                      <div className="rounded-md border border-border bg-muted/30 p-3">
                        <p className="text-xs font-medium text-muted-foreground">System Size</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{p.capacity_kw} kW</p>
                      </div>
                      <div className="rounded-md border border-border bg-muted/30 p-3">
                        <p className="text-xs font-medium text-muted-foreground">Final Amount</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">₹{Number(p.final_amount).toLocaleString()}</p>
                      </div>
                    </div>

                    {p.k_number && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">K Number:</span>
                        <span className="break-all">{p.k_number}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 border-t border-border bg-muted/20 p-5 xl:w-80 xl:border-l xl:border-t-0">
                    <Select value={p.status} onValueChange={(val) => handleStatusOverride(p.id, val as ProjectStatus)}>
                      <SelectTrigger className="h-10 w-full bg-card text-sm font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="grid grid-cols-2 gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="justify-start" onClick={() => { setAssignDialog({ projectId: p.id, type: 'welder' }); setSelectedStaffId(p.assigned_welder_id || ''); }}>
                          <UserCog className="h-3 w-3 mr-1" /> Welder
                        </Button>
                      </DialogTrigger>
                    </Dialog>
                    <Dialog>
                      <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="justify-start" onClick={() => { setAssignDialog({ projectId: p.id, type: 'electrician' }); setSelectedStaffId(p.assigned_electrician_id || ''); }}>
                          <UserCog className="h-3 w-3 mr-1" /> Electrician
                        </Button>
                      </DialogTrigger>
                    </Dialog>
                      <Button size="sm" variant="outline" className="justify-start" onClick={() => navigate(`/projects/${p.id}/documents`)}>
                        <FileText className="h-3 w-3 mr-1" /> Docs
                    </Button>
                      <Button size="sm" variant="outline" className="justify-start" onClick={() => navigate(`/projects/${p.id}/edit`)}>
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                      <Button size="sm" variant="outline" className="justify-start border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setProjectToDelete(p)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Delete
                    </Button>
                      <QuotationButton projectId={p.id} className="justify-start" />
                    </div>
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

      <AlertDialog open={!!projectToDelete} onOpenChange={(open) => { if (!open) setProjectToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the project. The lead will be moved to the cancelled bin so you can track refused installations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Project</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject} disabled={deletingId === projectToDelete?.id} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deletingId === projectToDelete?.id ? 'Deleting...' : 'Delete Project'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminProjects;
