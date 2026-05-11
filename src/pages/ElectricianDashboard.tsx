import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import StatCard from '@/components/dashboard/StatCard';
import { Zap, CheckCircle2, Clock, Search, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface ElecProject {
  id: string;
  project_code: string;
  capacity_kw: number;
  status: string;
  panel_brand: string;
  panel_qty: number;
  panel_watt: number;
  inverter_brand: string;
  inverter_capacity: number;
  consumer_name: string | null;
  k_number: string | null;
  special_notes: string | null;
  updated_at: string;
  lead_id: string;
}

interface LeadInfo {
  id: string;
  customer_name: string;
  mobile: string;
  address: string;
  village_city: string;
  district: string;
}

const ElectricianDashboard = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ElecProject[]>([]);
  const [leads, setLeads] = useState<Record<string, LeadInfo>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'pending' | 'done'>('pending');

  // Serial number dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ElecProject | null>(null);
  const [panelSerial, setPanelSerial] = useState('');
  const [inverterSerial, setInverterSerial] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('*')
      .in('status', ['wiring_pending', 'wiring_done'])
      .order('updated_at', { ascending: false });

    const rows = (data || []) as ElecProject[];
    setProjects(rows);

    if (rows.length > 0) {
      const leadIds = [...new Set(rows.map(r => r.lead_id))];
      const { data: leadData } = await supabase
        .from('leads')
        .select('id, customer_name, mobile, address, village_city, district')
        .in('id', leadIds);
      const map: Record<string, LeadInfo> = {};
      (leadData || []).forEach((l: any) => { map[l.id] = l; });
      setLeads(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const openSerialDialog = (project: ElecProject) => {
    setSelectedProject(project);
    setPanelSerial('');
    setInverterSerial('');
    setDialogOpen(true);
  };

  const submitWiringDone = async () => {
    if (!selectedProject || !user) return;
    if (!panelSerial.trim() || !inverterSerial.trim()) {
      toast.error('Please enter both serial numbers');
      return;
    }

    setSubmitting(true);

    // Insert serial numbers
    const { error: serialErr } = await supabase.from('serial_numbers').insert({
      project_id: selectedProject.id,
      panel_serial: panelSerial.trim(),
      inverter_serial: inverterSerial.trim(),
      entered_by_user_id: user.id,
    });

    if (serialErr) {
      toast.error('Failed to save serial numbers: ' + serialErr.message);
      setSubmitting(false);
      return;
    }

    // Update project status
    const { error: updateErr } = await supabase
      .from('projects')
      .update({ status: 'wiring_done' as any })
      .eq('id', selectedProject.id);

    if (updateErr) {
      toast.error('Failed to update status: ' + updateErr.message);
      setSubmitting(false);
      return;
    }


    toast.success('Wiring marked as done with serial numbers!');
    setDialogOpen(false);
    setSubmitting(false);
    fetchProjects();
  };

  const pending = projects.filter(p => p.status === 'wiring_pending');
  const done = projects.filter(p => p.status === 'wiring_done');
  const displayed = (tab === 'pending' ? pending : done).filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    const lead = leads[p.lead_id];
    return (
      p.project_code.toLowerCase().includes(q) ||
      (p.consumer_name || '').toLowerCase().includes(q) ||
      (lead?.customer_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Electrician Dashboard</h1>
        <p className="text-muted-foreground text-sm">Enter serial numbers and mark wiring complete</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard onClick={() => setTab('pending')} title="Pending Wiring" value={pending.length} icon={Clock} change={pending.length > 0 ? 'Needs work' : 'All clear'} />
        <StatCard onClick={() => setTab('done')} title="Completed" value={done.length} icon={CheckCircle2} />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-10" />
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as 'pending' | 'done')}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-1.5">
            <Zap className="h-4 w-4" /> Pending
            {pending.length > 0 && <Badge variant="destructive" className="ml-1 text-xs px-1.5">{pending.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="done" className="gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Completed
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : displayed.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              No {tab === 'pending' ? 'pending wiring jobs' : 'completed jobs'}
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {displayed.map(project => {
                const lead = leads[project.lead_id];
                return (
                  <Card key={project.id} className="shadow-card">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-foreground">{project.project_code}</p>
                            <Badge variant={project.status === 'wiring_pending' ? 'destructive' : 'default'}>
                              {project.status === 'wiring_pending' ? 'Wiring Pending' : 'Wiring Done'}
                            </Badge>
                          </div>
                          {lead && (
                            <p className="text-sm text-muted-foreground mt-1">{lead.customer_name} • {lead.mobile}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="text-muted-foreground">Capacity:</span> <span className="font-medium">{project.capacity_kw} kW</span></div>
                        <div><span className="text-muted-foreground">Panels:</span> <span className="font-medium">{project.panel_qty}× {project.panel_watt}W {project.panel_brand}</span></div>
                        <div><span className="text-muted-foreground">Inverter:</span> <span className="font-medium">{project.inverter_brand} {project.inverter_capacity}kW</span></div>
                        {project.k_number && <div><span className="text-muted-foreground">K Number:</span> <span className="font-medium">{project.k_number}</span></div>}
                      </div>

                      {lead && (
                        <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{lead.address}, {lead.village_city}, {lead.district}</span>
                        </div>
                      )}

                      {project.special_notes && (
                        <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">📝 {project.special_notes}</p>
                      )}

                      {project.status === 'wiring_pending' && (
                        <Button onClick={() => openSerialDialog(project)} className="w-full">
                          <Zap className="h-4 w-4 mr-2" />
                          Enter Serial Numbers & Mark Done
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Serial Number Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Serial Numbers — {selectedProject?.project_code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Panel Serial Number(s)</Label>
              <Input
                placeholder="e.g. PNL-2024-001, PNL-2024-002..."
                value={panelSerial}
                onChange={e => setPanelSerial(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">Enter all panel serial numbers (comma-separated)</p>
            </div>
            <div>
              <Label>Inverter Serial Number</Label>
              <Input
                placeholder="e.g. INV-2024-001"
                value={inverterSerial}
                onChange={e => setInverterSerial(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitWiringDone} disabled={submitting}>
              {submitting ? 'Saving...' : 'Submit & Mark Wiring Done'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ElectricianDashboard;
