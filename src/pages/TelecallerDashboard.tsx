import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import StatCard from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PhoneCall, Users, TrendingUp, Calendar } from 'lucide-react';

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

type Tab = 'all' | 'month' | 'today';

const TelecallerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, thisMonth: 0, today: 0 });
  const [tab, setTab] = useState<Tab>('all');

  const fetchLeads = async () => {
    if (!user) return;
    setLoading(true);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const [allRes, totalRes, monthRes, todayRes] = await Promise.all([
      supabase.from('leads').select('*').eq('created_by_user_id', user.id).order('created_at', { ascending: false }).limit(500),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('created_by_user_id', user.id),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('created_by_user_id', user.id).gte('created_at', startOfMonth),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('created_by_user_id', user.id).gte('created_at', startOfDay),
    ]);

    setLeads(allRes.data || []);
    setStats({
      total: totalRes.count || 0,
      thisMonth: monthRes.count || 0,
      today: todayRes.count || 0,
    });
    setLoading(false);
  };

  useEffect(() => { fetchLeads(); }, [user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`telecaller-leads-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `created_by_user_id=eq.${user.id}` }, () => fetchLeads())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user]);

  const filteredLeads = useMemo(() => {
    if (tab === 'all') return leads;
    const now = new Date();
    if (tab === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return leads.filter(l => new Date(l.created_at).getTime() >= start);
    }
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return leads.filter(l => new Date(l.created_at).getTime() >= start);
  }, [leads, tab]);

  const tabTitle = tab === 'all' ? 'All Leads' : tab === 'month' ? "This Month's Leads" : "Today's Leads";

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Telecaller Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Create and track your leads</p>
        </div>
        <Button onClick={() => navigate('/leads/new')} className="gradient-primary text-primary-foreground font-semibold">
          <PhoneCall className="mr-2 h-4 w-4" /> Create New Lead
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={tab === 'all' ? 'ring-2 ring-primary rounded-xl' : ''}>
          <StatCard onClick={() => setTab('all')} title="Total Leads" value={stats.total} icon={Users} />
        </div>
        <div className={tab === 'month' ? 'ring-2 ring-primary rounded-xl' : ''}>
          <StatCard onClick={() => setTab('month')} title="This Month" value={stats.thisMonth} icon={TrendingUp} />
        </div>
        <div className={tab === 'today' ? 'ring-2 ring-primary rounded-xl' : ''}>
          <StatCard onClick={() => setTab('today')} title="Today" value={stats.today} icon={Calendar} />
        </div>
      </div>

      <Card className="shadow-card border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">{tabTitle}</CardTitle>
          <span className="text-xs text-muted-foreground">{filteredLeads.length} shown</span>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm py-4 text-center">Loading...</p>
          ) : filteredLeads.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              {tab === 'all' ? 'No leads yet. Create your first lead!' : 'No leads in this period.'}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredLeads.map((lead) => (
                <div key={lead.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                  <div className="h-9 w-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-xs shrink-0">
                    {lead.customer_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{lead.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{lead.mobile} • {lead.village_city}, {lead.district}</p>
                  </div>
                  {lead.mobile && (
                    <a
                      href={`tel:${lead.mobile}`}
                      onClick={(e) => e.stopPropagation()}
                      className="h-8 w-8 rounded-full bg-success/10 text-success flex items-center justify-center hover:bg-success/20 transition-colors shrink-0"
                      aria-label={`Call ${lead.customer_name}`}
                    >
                      <PhoneCall className="h-4 w-4" />
                    </a>
                  )}
                  <Badge className={`text-xs shrink-0 ${statusColor[lead.status] || ''}`}>
                    {statusLabel(lead.status)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TelecallerDashboard;
