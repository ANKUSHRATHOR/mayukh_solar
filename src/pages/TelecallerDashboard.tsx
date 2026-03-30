import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import StatCard from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PhonePlus, Users, TrendingUp, Calendar } from 'lucide-react';

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

const TelecallerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, thisMonth: 0, today: 0 });

  const fetchLeads = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('created_by_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const allLeads = data || [];
    setLeads(allLeads);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    setStats({
      total: allLeads.length,
      thisMonth: allLeads.filter(l => new Date(l.created_at) >= startOfMonth).length,
      today: allLeads.filter(l => new Date(l.created_at) >= startOfDay).length,
    });
    setLoading(false);
  };

  useEffect(() => { fetchLeads(); }, [user]);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Telecaller Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Create and track your leads</p>
        </div>
        <Button onClick={() => navigate('/leads/new')} className="gradient-primary text-primary-foreground font-semibold">
          <PhonePlus className="mr-2 h-4 w-4" /> Create New Lead
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total Leads" value={stats.total} icon={Users} />
        <StatCard title="This Month" value={stats.thisMonth} icon={TrendingUp} />
        <StatCard title="Today" value={stats.today} icon={Calendar} />
      </div>

      <Card className="shadow-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Recent Leads</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm py-4 text-center">Loading...</p>
          ) : leads.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No leads yet. Create your first lead!</p>
          ) : (
            <div className="space-y-3">
              {leads.map((lead) => (
                <div key={lead.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                  <div className="h-9 w-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-xs shrink-0">
                    {lead.customer_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{lead.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{lead.mobile} • {lead.village_city}, {lead.district}</p>
                  </div>
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
