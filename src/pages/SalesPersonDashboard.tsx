import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import StatCard from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Briefcase, Users, Clock,
  Search, MapPin, Calendar as CalendarIcon, Bike, PhoneCall, X
} from 'lucide-react';

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

const SalesPersonDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [todayKm, setTodayKm] = useState<number>(0);
  const [monthKm, setMonthKm] = useState<number>(0);

  const fetchLeads = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('is_in_bin', false)
      .order('created_at', { ascending: false });
    setLeads(data || []);
    setLoading(false);
  };

  const fetchBikeKm = async () => {
    if (!user) return;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = today.getMonth() + 1;
    const dateStr = today.toISOString().slice(0, 10);
    const [{ data: dayData }, { data: monthData }] = await Promise.all([
      supabase.rpc('bike_km_for_day', { _user: user.id, _date: dateStr }),
      supabase.rpc('bike_km_summary', { _user: user.id, _year: yyyy, _month: mm }),
    ]);
    setTodayKm(Number(dayData ?? 0));
    setMonthKm(Number((monthData as any)?.[0]?.total_km ?? 0));
  };

  useEffect(() => { fetchLeads(); fetchBikeKm(); }, [user]);

  const stats = {
    total: leads.length,
    newLeads: leads.filter(l => l.status === 'new').length,
    followUps: leads.filter(l => l.status === 'follow_up').length,
    overdue: leads.filter(l => l.status === 'follow_up' && l.follow_up_date && new Date(l.follow_up_date) < new Date()).length,
  };

  const filtered = leads.filter(l => {
    const matchSearch = !search || l.customer_name.toLowerCase().includes(search.toLowerCase()) || l.mobile.includes(search) || l.village_city.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || l.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sales Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your leads and site visits</p>
        </div>
        <Button onClick={() => navigate('/leads/new')} className="gradient-primary text-primary-foreground font-semibold">
          <PhoneCall className="mr-2 h-4 w-4" /> Create New Lead
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard onClick={() => setFilterStatus('all')} title="Total Leads" value={stats.total} icon={Users} />
        <StatCard onClick={() => setFilterStatus('new')} title="New Leads" value={stats.newLeads} icon={Briefcase} />
        <StatCard onClick={() => setFilterStatus('follow_up')} title="Follow-ups" value={stats.followUps} icon={CalendarIcon} />
        <StatCard onClick={() => setFilterStatus('follow_up')} title="Overdue" value={stats.overdue} icon={Clock} changeType={stats.overdue > 0 ? 'down' : 'neutral'} change={stats.overdue > 0 ? 'Action needed!' : 'All clear'} />
      </div>

      <Card className="shadow-card border-border">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl gradient-primary flex items-center justify-center text-primary-foreground shrink-0">
            <Bike className="h-6 w-6" />
          </div>
          <div className="flex-1 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Today's Distance</p>
              <p className="text-2xl font-bold text-foreground">{todayKm.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">km</span></p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">This Month</p>
              <p className="text-2xl font-bold text-foreground">{monthKm.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">km</span></p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, mobile, city..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['all', 'new', 'visited', 'follow_up', 'interested', 'final'].map(s => (
            <Button
              key={s}
              variant={filterStatus === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus(s)}
              className={filterStatus === s ? 'gradient-primary text-primary-foreground' : ''}
            >
              {s === 'all' ? 'All' : statusLabel(s)}
            </Button>
          ))}
        </div>
      </div>

      {/* Lead List */}
      <Card className="shadow-card border-border">
        <CardContent className="p-0">
          {loading ? (
            <p className="text-muted-foreground text-sm py-12 text-center">Loading leads...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm py-12 text-center">No leads found.</p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(lead => {
                const isOverdue = lead.status === 'follow_up' && lead.follow_up_date && new Date(lead.follow_up_date) < new Date();
                return (
                  <div
                    key={lead.id}
                    className={`flex items-center gap-4 p-4 hover:bg-accent/30 transition-colors cursor-pointer ${isOverdue ? 'bg-destructive/5' : ''}`}
                    onClick={() => navigate(`/leads/${lead.id}`)}
                  >
                    <div className="h-10 w-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
                      {lead.customer_name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-foreground">{lead.customer_name}</p>
                        {isOverdue && <Badge variant="destructive" className="text-xs">Overdue</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        {lead.mobile}
                        <span className="mx-1">•</span>
                        <MapPin className="h-3 w-3" />
                        {lead.village_city}, {lead.district}
                      </p>
                      {lead.follow_up_date && lead.status === 'follow_up' && (
                        <p className={`text-xs mt-0.5 ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                          Follow-up: {new Date(lead.follow_up_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <Badge className={`text-xs shrink-0 ${statusColor[lead.status] || ''}`}>
                      {statusLabel(lead.status)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SalesPersonDashboard;
