import { useEffect, useMemo, useState } from 'react';
import {
  Users, CheckCircle2, XCircle, FileText, IndianRupee, Clock, Briefcase,
  UserPlus, FolderOpen, Activity, LayoutDashboard, Filter, Calendar as CalendarIcon, Loader2,
} from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import AdminLeadsList from './AdminLeadsList';

interface DashboardStats {
  totalLeads: number;
  runningProjects: number;
  completedInPeriod: number;
  cancelledLeads: number;
  pendingDocuments: number;
  revenueInPeriod: number;
  overdueFollowUps: number;
  cashProjects: number;
  loanProjects: number;
  pendingTasks: number;
  presentToday: number;
}

interface ActivityItem { time: string; text: string; icon: any }

type Period = 'this_month' | 'all_time' | 'running' | 'custom';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('this_month');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');

  const range = useMemo(() => {
    const now = new Date();
    if (period === 'all_time' || period === 'running') return { from: null as string | null, to: null as string | null };
    if (period === 'custom') {
      return {
        from: customFrom ? new Date(customFrom).toISOString() : null,
        to: customTo ? new Date(new Date(customTo).getTime() + 86400000 - 1).toISOString() : null,
      };
    }
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: null };
  }, [period, customFrom, customTo]);

  useEffect(() => { fetchDashboardData(); /* eslint-disable-next-line */ }, [period, customFrom, customTo]);

  const fetchDashboardData = async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const { from, to } = range;

    let leadsQuery = supabase.from('leads').select('id', { count: 'exact', head: true }).eq('is_in_bin', false);
    if (from) leadsQuery = leadsQuery.gte('created_at', from);
    if (to) leadsQuery = leadsQuery.lte('created_at', to);

    const [
      leadsRes, cancelledRes, projectsRes, overdueRes,
      recentLeadsRes, recentProjectsRes, recentDocsRes, tasksRes, attendanceRes,
    ] = await Promise.all([
      leadsQuery,
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'cancelled').eq('is_in_bin', false),
      supabase.from('projects').select('status, final_amount, payment_type, completed_at, created_at'),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'follow_up').lt('follow_up_date', new Date().toISOString()).eq('is_in_bin', false),
      supabase.from('leads').select('customer_name, created_at, status').order('created_at', { ascending: false }).limit(3),
      supabase.from('projects').select('project_code, status, updated_at').order('updated_at', { ascending: false }).limit(3),
      supabase.from('documents').select('document_type, uploaded_at, is_verified').order('uploaded_at', { ascending: false }).limit(2),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
      supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('date', today).in('status', ['present', 'late', 'half_day']),
    ]);

    const projects = projectsRes.data || [];
    const inPeriod = (iso: string | null) => {
      if (!iso) return false;
      if (period === 'all_time' || period === 'running') return true;
      if (from && iso < from) return false;
      if (to && iso > to) return false;
      return true;
    };
    const completedInPeriod = projects.filter(p => p.status === 'project_completed' && inPeriod(p.completed_at)).length;
    const running = projects.filter(p => p.status !== 'project_completed').length;
    const pendingDocs = projects.filter(p => p.status === 'pending_documents').length;
    const cashProjects = projects.filter(p => p.payment_type === 'cash' && (period === 'running' ? p.status !== 'project_completed' : inPeriod(p.created_at) || period === 'all_time')).length;
    const loanProjects = projects.filter(p => p.payment_type === 'loan' && (period === 'running' ? p.status !== 'project_completed' : inPeriod(p.created_at) || period === 'all_time')).length;
    const revenue = projects.filter(p => p.status === 'project_completed' && inPeriod(p.completed_at))
      .reduce((s, p) => s + Number(p.final_amount || 0), 0);

    setStats({
      totalLeads: leadsRes.count || 0,
      runningProjects: running,
      completedInPeriod,
      cancelledLeads: cancelledRes.count || 0,
      pendingDocuments: pendingDocs,
      revenueInPeriod: revenue,
      overdueFollowUps: overdueRes.count || 0,
      cashProjects,
      loanProjects,
      pendingTasks: tasksRes.count || 0,
      presentToday: attendanceRes.count || 0,
    });

    const feed: ActivityItem[] = [];
    (recentLeadsRes.data || []).forEach(l => feed.push({ time: timeAgo(l.created_at), text: `New lead — ${l.customer_name}`, icon: UserPlus }));
    (recentProjectsRes.data || []).forEach(p => feed.push({ time: timeAgo(p.updated_at), text: `Project ${p.project_code} → ${p.status.replace(/_/g, ' ')}`, icon: Briefcase }));
    (recentDocsRes.data || []).forEach(d => feed.push({ time: timeAgo(d.uploaded_at), text: `Document: ${d.document_type.replace(/_/g, ' ')}`, icon: FileText }));
    setActivity(feed.length ? feed.slice(0, 6) : [{ time: 'Now', text: 'No recent activity', icon: Activity }]);
    setLoading(false);
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const periodLabel: Record<Period, string> = {
    this_month: 'This Month', all_time: 'All Time', running: 'Currently Running', custom: 'Custom Range',
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">Mayukh Solar CRM</p>
          <h1 className="text-3xl lg:text-4xl font-bold text-foreground mt-1">Welcome back<span className="text-gradient">.</span></h1>
          <p className="text-muted-foreground text-sm mt-1.5 inline-flex items-center"><span className="pulse-dot" />&nbsp;Live business overview</p>
        </div>
        <Button onClick={() => navigate('/staff/new')} className="gradient-primary text-primary-foreground font-semibold shadow-glow hover:opacity-90">
          <UserPlus className="mr-2 h-4 w-4" /> Add Staff
        </Button>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-5">
        <TabsList className="grid w-full sm:w-auto grid-cols-2 sm:inline-grid">
          <TabsTrigger value="dashboard" className="gap-2 data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground">
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="leads" className="gap-2 data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground">
            <Users className="h-4 w-4" /> Leads
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6 mt-0">
          <Card className="shadow-card border-border">
            <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground shrink-0">
                <Filter className="h-4 w-4 text-primary" /> Filter:
              </div>
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="all_time">All Time</SelectItem>
                  <SelectItem value="running">Currently Running</SelectItem>
                  <SelectItem value="custom">Custom Date Range</SelectItem>
                </SelectContent>
              </Select>
              {period === 'custom' && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <CalendarIcon className="h-4 w-4" />
                      {customFrom && customTo ? `${customFrom} → ${customTo}` : 'Pick date range'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">From</Label>
                      <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">To</Label>
                      <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              <span className="text-xs text-muted-foreground sm:ml-auto">Showing: <strong className="text-foreground">{periodLabel[period]}</strong></span>
            </CardContent>
          </Card>

          {loading || !stats ? (
            <div className="flex items-center justify-center min-h-[40vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatCard accent="primary" onClick={() => navigate('/leads')} title="Total Leads" value={String(stats.totalLeads)} icon={Users} change={periodLabel[period]} changeType={stats.totalLeads > 0 ? 'up' : 'neutral'} />
                <StatCard accent="info" onClick={() => navigate('/admin/projects')} title="Running Projects" value={String(stats.runningProjects)} icon={Briefcase} change={stats.runningProjects > 0 ? 'Active pipeline' : 'None'} changeType={stats.runningProjects > 0 ? 'up' : 'neutral'} />
                <StatCard accent="success" onClick={() => navigate('/admin/projects')} title="Completed" value={String(stats.completedInPeriod)} icon={CheckCircle2} change={periodLabel[period]} changeType={stats.completedInPeriod > 0 ? 'up' : 'neutral'} />
                <StatCard accent="destructive" onClick={() => navigate('/leads/bin')} title="Cancelled" value={String(stats.cancelledLeads)} icon={XCircle} change={stats.cancelledLeads > 0 ? `${stats.cancelledLeads} in bin` : 'All clear'} changeType={stats.cancelledLeads > 0 ? 'down' : 'neutral'} />
                <StatCard accent="warning" onClick={() => navigate('/admin/projects')} title="Cash Projects" value={String(stats.cashProjects)} icon={IndianRupee} change="Direct payment" changeType="neutral" />
                <StatCard accent="info" onClick={() => navigate('/admin/projects')} title="Loan Projects" value={String(stats.loanProjects)} icon={FolderOpen} change="Financed" changeType="neutral" />
                <StatCard accent="primary" onClick={() => navigate('/tasks')} title="Pending Tasks" value={String(stats.pendingTasks)} icon={Clock} change={stats.pendingTasks > 0 ? 'Open work' : 'All done'} changeType={stats.pendingTasks > 0 ? 'down' : 'up'} />
                <StatCard accent="success" onClick={() => navigate('/admin/attendance')} title="Present Today" value={String(stats.presentToday)} icon={CheckCircle2} change="Staff on duty" changeType="up" />
                <StatCard accent="warning" onClick={() => navigate('/admin/projects')} title="Pending Docs" value={String(stats.pendingDocuments)} icon={FileText} change="Awaiting upload" changeType={stats.pendingDocuments > 0 ? 'down' : 'neutral'} />
                <StatCard accent="success" onClick={() => navigate('/admin/projects')} title="Revenue" value={`₹${stats.revenueInPeriod > 0 ? (stats.revenueInPeriod / 100000).toFixed(1) + 'L' : '0'}`} icon={IndianRupee} change={periodLabel[period]} changeType={stats.revenueInPeriod > 0 ? 'up' : 'neutral'} />
                <StatCard accent="destructive" onClick={() => navigate('/leads')} title="Overdue Follow-ups" value={String(stats.overdueFollowUps)} icon={Clock} change={stats.overdueFollowUps > 0 ? 'Needs attention' : 'All clear'} changeType={stats.overdueFollowUps > 0 ? 'down' : 'neutral'} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="shadow-card border-border">
                  <CardHeader className="pb-3"><CardTitle className="text-base font-semibold">Quick Actions</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/staff')}><Users className="mr-2 h-4 w-4" /> View All Staff</Button>
                    <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/staff/new')}><UserPlus className="mr-2 h-4 w-4" /> Add Staff Member</Button>
                    <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/leads')}><FileText className="mr-2 h-4 w-4" /> View All Leads</Button>
                    <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/admin/projects')}><FolderOpen className="mr-2 h-4 w-4" /> View All Projects</Button>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2 shadow-card border-border">
                  <CardHeader className="pb-3"><CardTitle className="text-base font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Recent Activity</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {activity.map((item, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className="mt-0.5 p-1.5 rounded-md bg-accent shrink-0"><item.icon className="h-3.5 w-3.5 text-accent-foreground" /></div>
                          <div className="min-w-0">
                            <p className="text-sm text-foreground">{item.text}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{item.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="leads" className="mt-0 -mx-4 sm:-mx-6 lg:-mx-8">
          <AdminLeadsList />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminDashboard;
