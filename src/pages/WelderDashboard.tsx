import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StatCard from '@/components/dashboard/StatCard';
import { Wrench, CheckCircle2, Clock, Search, MapPin } from 'lucide-react';
import { toast } from 'sonner';

interface WelderProject {
  id: string;
  project_code: string;
  capacity_kw: number;
  status: string;
  panel_brand: string;
  panel_qty: number;
  panel_watt: number;
  inverter_brand: string;
  inverter_capacity: number;
  structure_type: string;
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

const structureLabels: Record<string, string> = {
  rcc_roof: 'RCC Roof',
  tin_shed_roof: 'Tin Shed Roof',
  ground_mount: 'Ground Mount',
};

const WelderDashboard = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<WelderProject[]>([]);
  const [leads, setLeads] = useState<Record<string, LeadInfo>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [marking, setMarking] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('*')
      .in('status', ['installation_pending', 'installation_done'])
      .order('updated_at', { ascending: false });

    const rows = (data || []) as WelderProject[];
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

  const markInstallationDone = async (projectId: string) => {
    setMarking(projectId);
    const { error } = await supabase
      .from('projects')
      .update({ status: 'installation_done' as any })
      .eq('id', projectId);

    if (error) {
      toast.error('Failed to update: ' + error.message);
    } else {
      toast.success('Installation marked as done!');
      fetchProjects();
    }
    setMarking(null);
  };

  const pending = projects.filter(p => p.status === 'installation_pending');
  const done = projects.filter(p => p.status === 'installation_done');
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
        <h1 className="text-2xl font-bold text-foreground">Welder Dashboard</h1>
        <p className="text-muted-foreground text-sm">View assigned installations and mark them complete</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard title="Pending Installations" value={pending.length} icon={Clock} change={pending.length > 0 ? 'Needs work' : 'All clear'} />
        <StatCard title="Completed" value={done.length} icon={CheckCircle2} />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-10" />
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as 'pending' | 'done')}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-1.5">
            <Wrench className="h-4 w-4" /> Pending
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
              No {tab === 'pending' ? 'pending installations' : 'completed installations'}
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
                            <Badge variant={project.status === 'installation_pending' ? 'destructive' : 'default'}>
                              {project.status === 'installation_pending' ? 'Pending' : 'Done'}
                            </Badge>
                          </div>
                          {lead && (
                            <p className="text-sm text-muted-foreground mt-1">{lead.customer_name} • {lead.mobile}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="text-muted-foreground">Capacity:</span> <span className="font-medium">{project.capacity_kw} kW</span></div>
                        <div><span className="text-muted-foreground">Structure:</span> <span className="font-medium">{structureLabels[project.structure_type] || project.structure_type}</span></div>
                        <div><span className="text-muted-foreground">Panels:</span> <span className="font-medium">{project.panel_qty}× {project.panel_watt}W {project.panel_brand}</span></div>
                        <div><span className="text-muted-foreground">Inverter:</span> <span className="font-medium">{project.inverter_brand} {project.inverter_capacity}kW</span></div>
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

                      {project.status === 'installation_pending' && (
                        <Button
                          onClick={() => markInstallationDone(project.id)}
                          disabled={marking === project.id}
                          className="w-full"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          {marking === project.id ? 'Updating...' : 'Mark Installation Done'}
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
    </div>
  );
};

export default WelderDashboard;
