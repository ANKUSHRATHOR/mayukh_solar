import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import StatCard from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PhoneCall, Users, TrendingUp, Calendar, X } from 'lucide-react';

const statusColor: Record<string, string> = {
  new: 'bg-info text-info-foreground',
  visited: 'bg-accent text-accent-foreground',
  follow_up: 'bg-warning text-warning-foreground',
  interested: 'bg-success text-success-foreground',
  not_interested: 'bg-destructive text-destructive-foreground',
  cancelled: 'bg-muted text-muted-foreground',
  final: 'bg-primary text-primary-foreground',
};

const statusLabel = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

type DateRange = 'all' | 'today' | 'this_month' | 'last_month';

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

const TelecallerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<any[]>([]);
  const [salesStaff, setSalesStaff] = useState<{ user_id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, thisMonth: 0, today: 0 });

  // Filters
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [assignedFilter, setAssignedFilter] = useState<string>('all');

  const fetchLeads = async () => {
    if (!user) return;
    setLoading(true);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const [allRes, totalRes, monthRes, todayRes, salesRes] = await Promise.all([
      supabase.from('leads').select('*').eq('created_by_user_id', user.id).order('created_at', { ascending: false }).limit(500),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('created_by_user_id', user.id),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('created_by_user_id', user.id).gte('created_at', startOfMonth),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('created_by_user_id', user.id).gte('created_at', startOfDay),
      supabase.rpc('get_assignable_sales_persons'),
    ]);

    setLeads(allRes.data || []);
    setSalesStaff(((salesRes.data as any[]) || []).map(s => ({ user_id: s.user_id, full_name: s.full_name })));
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

  // Restrict the "Sales Person Assigned" chips to staff actually assigned in this list
  const assignedSalesInData = useMemo(() => {
    const ids = new Set<string>();
    leads.forEach(l => { if (l.assigned_to_user_id) ids.add(l.assigned_to_user_id); });
    return salesStaff.filter(s => ids.has(s.user_id));
  }, [leads, salesStaff]);

  const filteredLeads = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const endLastMonth = startThisMonth;

    return leads.filter(l => {
      const ts = new Date(l.created_at).getTime();
      if (dateRange === 'today' && ts < startToday) return false;
      if (dateRange === 'this_month' && ts < startThisMonth) return false;
      if (dateRange === 'last_month' && (ts < startLastMonth || ts >= endLastMonth)) return false;
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (sourceFilter !== 'all' && l.source !== sourceFilter) return false;
      if (assignedFilter !== 'all') {
        if (assignedFilter === 'unassigned' && l.assigned_to_user_id) return false;
        if (assignedFilter !== 'unassigned' && l.assigned_to_user_id !== assignedFilter) return false;
      }
      return true;
    });
  }, [leads, dateRange, statusFilter, sourceFilter, assignedFilter]);

  const activeFilterCount =
    (dateRange !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (sourceFilter !== 'all' ? 1 : 0) +
    (assignedFilter !== 'all' ? 1 : 0);

  const clearFilters = () => {
    setDateRange('all');
    setStatusFilter('all');
    setSourceFilter('all');
    setAssignedFilter('all');
  };

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
        <StatCard onClick={() => setDateRange('all')} title="Total Leads" value={stats.total} icon={Users} />
        <StatCard onClick={() => setDateRange('this_month')} title="This Month" value={stats.thisMonth} icon={TrendingUp} />
        <StatCard onClick={() => setDateRange('today')} title="Today" value={stats.today} icon={Calendar} />
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
            <p className="text-[11px] font-medium text-muted-foreground">Date Range</p>
            <div className="flex flex-wrap gap-1.5">
              {([
                { v: 'all', l: 'All Time' },
                { v: 'today', l: 'Today' },
                { v: 'this_month', l: 'This Month' },
                { v: 'last_month', l: 'Last Month' },
              ] as { v: DateRange; l: string }[]).map(c => (
                <Chip key={c.v} active={dateRange === c.v} onClick={() => setDateRange(c.v)}>{c.l}</Chip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {['all', 'new', 'visited', 'follow_up', 'interested', 'not_interested', 'final', 'cancelled'].map(s => (
                <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                  {s === 'all' ? 'All' : statusLabel(s)}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground">Lead Source</p>
            <div className="flex flex-wrap gap-1.5">
              {['all', 'phone_call', 'walk_in', 'reference', 'camp', 'online'].map(s => (
                <Chip key={s} active={sourceFilter === s} onClick={() => setSourceFilter(s)}>
                  {s === 'all' ? 'All' : statusLabel(s)}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground">Sales Person Assigned</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={assignedFilter === 'all'} onClick={() => setAssignedFilter('all')}>All</Chip>
              <Chip active={assignedFilter === 'unassigned'} onClick={() => setAssignedFilter('unassigned')}>Unassigned</Chip>
              {assignedSalesInData.map(s => (
                <Chip key={s.user_id} active={assignedFilter === s.user_id} onClick={() => setAssignedFilter(s.user_id)}>
                  {s.full_name}
                </Chip>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Leads</CardTitle>
          <span className="text-xs text-muted-foreground">{filteredLeads.length} shown</span>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm py-4 text-center">Loading...</p>
          ) : filteredLeads.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              {leads.length === 0 ? 'No leads yet. Create your first lead!' : 'No leads match the current filters.'}
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
