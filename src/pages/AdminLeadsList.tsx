import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Search, MapPin, PhoneCall, Users, Filter, UserPlus as AssignIcon
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type LeadStatus = Database['public']['Enums']['lead_status'];

const statusColor: Record<string, string> = {
  new: 'bg-info text-info-foreground',
  visited: 'bg-accent text-accent-foreground',
  follow_up: 'bg-warning text-warning-foreground',
  interested: 'bg-success text-success-foreground',
  not_interested: 'bg-destructive text-destructive-foreground',
  cancelled: 'bg-muted text-muted-foreground',
  final: 'bg-primary text-primary-foreground',
};

const statusLabel = (s: string) => s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

const AdminLeadsList = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [leads, setLeads] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const [leadsRes, staffRes, rolesRes] = await Promise.all([
      supabase.from('leads').select('*').eq('is_in_bin', false).order('created_at', { ascending: false }),
      supabase.from('staff').select('*'),
      supabase.from('user_roles').select('*'),
    ]);

    setLeads(leadsRes.data || []);

    // Build sales person list
    const salesRoles = (rolesRes.data || []).filter(r => r.role === 'sales_person');
    const salesUserIds = new Set(salesRoles.map(r => r.user_id));
    const salesStaff = (staffRes.data || []).filter(s => salesUserIds.has(s.user_id) && s.is_active);
    setStaffList(salesStaff);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const assignLead = async (leadId: string, userId: string) => {
    const selectedLead = leads.find(l => l.id === leadId);
    if (selectedLead?.status === 'final') {
      toast({ title: 'Lead locked', description: 'Finalized leads cannot be edited or reassigned.', variant: 'destructive' });
      setAssigningId(null);
      return;
    }

    try {
      const { error } = await supabase.from('leads').update({ assigned_to_user_id: userId }).eq('id', leadId);
      if (error) throw error;
      toast({ title: 'Lead assigned!' });
      setAssigningId(null);
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const filtered = leads.filter(l => {
    const matchSearch = !search || l.customer_name.toLowerCase().includes(search.toLowerCase()) || l.mobile.includes(search) || l.village_city.toLowerCase().includes(search.toLowerCase()) || l.district.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || l.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const assignedStaffName = (userId: string | null) => {
    if (!userId) return null;
    const s = staffList.find(st => st.user_id === userId);
    return s ? s.full_name : null;
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">All Leads</h1>
          <p className="text-muted-foreground text-sm mt-1">{leads.length} total leads</p>
        </div>
        <Button onClick={() => navigate('/leads/new')} className="gradient-primary text-primary-foreground font-semibold">
          <PhoneCall className="mr-2 h-4 w-4" /> Create Lead
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name, mobile, city, district..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['all', 'new', 'visited', 'follow_up', 'interested', 'not_interested', 'final'].map(s => (
            <Button key={s} variant={filterStatus === s ? 'default' : 'outline'} size="sm" onClick={() => setFilterStatus(s)}
              className={filterStatus === s ? 'gradient-primary text-primary-foreground' : ''}>
              {s === 'all' ? 'All' : statusLabel(s)}
            </Button>
          ))}
        </div>
      </div>

      {/* Leads */}
      <Card className="shadow-card border-border">
        <CardContent className="p-0">
          {loading ? (
            <p className="text-muted-foreground text-sm py-12 text-center">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm py-12 text-center">No leads found.</p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(lead => (
                <div key={lead.id} className="flex items-center gap-4 p-4 hover:bg-accent/30 transition-colors">
                  <div className="h-10 w-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0 cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                    {lead.customer_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                    <p className="font-semibold text-sm text-foreground">{lead.customer_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {lead.mobile} • <MapPin className="h-3 w-3 inline" /> {lead.village_city}, {lead.district}
                    </p>
                    {assignedStaffName(lead.assigned_to_user_id) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Assigned: <span className="font-medium text-foreground">{assignedStaffName(lead.assigned_to_user_id)}</span>
                      </p>
                    )}
                  </div>
                  <Badge className={`text-xs shrink-0 ${statusColor[lead.status] || ''}`}>
                    {statusLabel(lead.status)}
                  </Badge>

                  {/* Assign dropdown */}
                  {lead.status === 'final' ? (
                    <Badge variant="outline" className="shrink-0">Locked</Badge>
                  ) : assigningId === lead.id ? (
                    <Select onValueChange={v => assignLead(lead.id, v)}>
                      <SelectTrigger className="w-36 h-8 text-xs">
                        <SelectValue placeholder="Assign to..." />
                      </SelectTrigger>
                      <SelectContent>
                        {staffList.map(s => (
                          <SelectItem key={s.user_id} value={s.user_id} className="text-xs">{s.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => setAssigningId(lead.id)} title="Assign to Sales Person">
                      <AssignIcon className="h-4 w-4" />
                    </Button>
                  )}
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
