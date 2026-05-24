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
  Search, MapPin, PhoneCall, UserPlus as AssignIcon, User, Zap, Download
} from 'lucide-react';
import { downloadCsv } from '@/lib/exportCsv';
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
  const [allStaff, setAllStaff] = useState<any[]>([]);
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
    setAllStaff(staffRes.data || []);

    // Build sales person list
    const salesRoles = (rolesRes.data || []).filter(r => r.role === 'sales_person');
    const salesUserIds = new Set(salesRoles.map(r => r.user_id));
    const salesStaff = (staffRes.data || []).filter(s => salesUserIds.has(s.user_id) && s.is_active);
    setStaffList(salesStaff);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const assignLead = async (leadId: string, userId: string) => {
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

  const staffName = (userId: string | null) => {
    if (!userId) return 'Unknown user';
    return allStaff.find(st => st.user_id === userId)?.full_name || 'Unknown user';
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-display">All Leads</h1>
          <p className="text-muted-foreground text-sm mt-1">{leads.length} total leads</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadCsv('leads.csv', [
            { header: 'Created', value: (l: any) => new Date(l.created_at).toLocaleString() },
            { header: 'Customer', value: (l: any) => l.customer_name },
            { header: 'Mobile', value: (l: any) => l.mobile },
            { header: 'City', value: (l: any) => l.village_city },
            { header: 'District', value: (l: any) => l.district },
            { header: 'State', value: (l: any) => l.state },
            { header: 'kW Interest', value: (l: any) => l.kw_interest ?? '' },
            { header: 'Status', value: (l: any) => l.status },
            { header: 'Source', value: (l: any) => l.source },
            { header: 'Created By', value: (l: any) => staffName(l.created_by_user_id) },
            { header: 'Assigned To', value: (l: any) => assignedStaffName(l.assigned_to_user_id) || '' },
          ], filtered)} disabled={!leads.length}><Download className="mr-2 h-4 w-4" /> Export</Button>
          <Button onClick={() => navigate('/leads/new')} className="btn-glow font-semibold">
            <PhoneCall className="mr-2 h-4 w-4" /> Create Lead
          </Button>
        </div>
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
              className={filterStatus === s ? 'btn-glow' : ''}>
              {s === 'all' ? 'All' : statusLabel(s)}
            </Button>
          ))}
        </div>
      </div>

      {/* Leads */}
      <Card className="border-0 bg-transparent shadow-none">
        <CardContent className="p-0">
          {loading ? (
            <p className="text-muted-foreground text-sm py-12 text-center">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm py-12 text-center">No leads found.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filtered.map(lead => (
                <div key={lead.id} className="bento p-5 transition-shadow hover:shadow-elevated">
                  <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-extrabold text-foreground">{lead.customer_name}</h2>
                      <p className="text-sm text-muted-foreground">{lead.source ? statusLabel(lead.source) : 'Lead'}</p>
                    </div>
                    <Badge className={`shrink-0 rounded-full px-3 py-1 text-xs ${statusColor[lead.status] || ''}`}>
                      {statusLabel(lead.status)}
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
                    <p className="flex items-center gap-2"><PhoneCall className="h-4 w-4" /> {lead.mobile}</p>
                    <p className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {lead.village_city}, {lead.district}</p>
                    <p className="flex items-center gap-2"><User className="h-4 w-4" /> Created By: <span className="font-semibold text-foreground">{staffName(lead.created_by_user_id)}</span></p>
                    <p className="flex items-center gap-2"><User className="h-4 w-4" /> Assigned To: <span className="font-semibold text-foreground">{assignedStaffName(lead.assigned_to_user_id) || 'Not assigned'}</span></p>
                    {lead.kw_interest && <p className="flex items-center gap-2 text-primary"><Zap className="h-4 w-4" /> {lead.kw_interest} kW Interest</p>}
                  </div>

                  {/* Assign dropdown */}
                  {assigningId === lead.id ? (
                    <Select onValueChange={v => assignLead(lead.id, v)}>
                      <SelectTrigger className="mt-4 h-9 w-full text-xs">
                        <SelectValue placeholder="Assign to..." />
                      </SelectTrigger>
                      <SelectContent>
                        {staffList.map(s => (
                          <SelectItem key={s.user_id} value={s.user_id} className="text-xs">{s.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => setAssigningId(lead.id)} title="Assign to Sales Person">
                      <AssignIcon className="mr-2 h-4 w-4" /> Assign Staff
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
