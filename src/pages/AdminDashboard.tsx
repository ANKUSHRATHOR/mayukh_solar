import { useEffect, useState } from 'react';
import {
  Users,
  TrendingUp,
  CheckCircle2,
  XCircle,
  FileText,
  IndianRupee,
  Clock,
  Briefcase,
  UserPlus,
  FolderOpen,
  Activity,
} from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface DashboardStats {
  totalLeadsThisMonth: number;
  runningProjects: number;
  completedThisMonth: number;
  cancelledLeads: number;
  pendingDocuments: number;
  revenueThisMonth: number;
  overdueFollowUps: number;
  pendingLoanFiles: number;
  cashProjects: number;
  loanProjects: number;
  pendingTasks: number;
  presentToday: number;
}

interface ActivityItem {
  time: string;
  text: string;
  icon: any;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const today = new Date().toISOString().slice(0, 10);

    const [
      leadsMonthRes,
      cancelledRes,
      projectsRes,
      overdueRes,
      recentLeadsRes,
      recentProjectsRes,
      recentDocsRes,
      tasksRes,
      attendanceRes,
    ] = await Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', monthStart).eq('is_in_bin', false),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'cancelled').eq('is_in_bin', false),
      supabase.from('projects').select('status, final_amount, payment_type, completed_at'),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'follow_up').lt('follow_up_date', now.toISOString()).eq('is_in_bin', false),
      supabase.from('leads').select('customer_name, created_at, status').order('created_at', { ascending: false }).limit(3),
      supabase.from('projects').select('project_code, status, updated_at').order('updated_at', { ascending: false }).limit(3),
      supabase.from('documents').select('document_type, uploaded_at, is_verified').order('uploaded_at', { ascending: false }).limit(2),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
      supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('date', today).in('status', ['present', 'late', 'half_day']),
    ]);

    const projects = projectsRes.data || [];
    const completedThisMonth = projects.filter(p => p.status === 'project_completed' && p.completed_at && p.completed_at >= monthStart).length;
    const running = projects.filter(p => p.status !== 'project_completed').length;
    const pendingDocs = projects.filter(p => p.status === 'pending_documents').length;
    const pendingLoan = projects.filter(p => p.status === 'loan_process').length;
    const cashProjects = projects.filter(p => p.payment_type === 'cash').length;
    const loanProjects = projects.filter(p => p.payment_type === 'loan').length;
    const revenue = projects.filter(p => p.status === 'project_completed' && p.completed_at && p.completed_at >= monthStart)
      .reduce((s, p) => s + Number(p.final_amount || 0), 0);

    setStats({
      totalLeadsThisMonth: leadsMonthRes.count || 0,
      runningProjects: running,
      completedThisMonth,
      cancelledLeads: cancelledRes.count || 0,
      pendingDocuments: pendingDocs,
      revenueThisMonth: revenue,
      overdueFollowUps: overdueRes.count || 0,
      pendingLoanFiles: pendingLoan,
      cashProjects,
      loanProjects,
      pendingTasks: tasksRes.count || 0,
      presentToday: attendanceRes.count || 0,
    });

    // Build activity feed from real data
    const feed: ActivityItem[] = [];
    (recentLeadsRes.data || []).forEach(l => {
      feed.push({ time: timeAgo(l.created_at), text: `New lead created — ${l.customer_name}`, icon: UserPlus });
    });
    (recentProjectsRes.data || []).forEach(p => {
      feed.push({ time: timeAgo(p.updated_at), text: `Project ${p.project_code} → ${p.status.replace(/_/g, ' ')}`, icon: Briefcase });
    });
    (recentDocsRes.data || []).forEach(d => {
      feed.push({ time: timeAgo(d.uploaded_at), text: `Document uploaded: ${d.document_type.replace(/_/g, ' ')}`, icon: FileText });
    });
    feed.sort((a, b) => a.time.localeCompare(b.time));
    setActivity(feed.length > 0 ? feed.slice(0, 6) : [{ time: 'Now', text: 'No recent activity yet', icon: Activity }]);
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

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const s = stats!;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Welcome back. Here's your business overview.</p>
        </div>
        <Button onClick={() => navigate('/staff/new')} className="gradient-primary text-primary-foreground font-semibold">
          <UserPlus className="mr-2 h-4 w-4" /> Add Staff
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard onClick={() => navigate('/leads')} title="Total Leads This Month" value={String(s.totalLeadsThisMonth)} icon={Users} change={s.totalLeadsThisMonth > 0 ? `${s.totalLeadsThisMonth} new` : 'No leads yet'} changeType={s.totalLeadsThisMonth > 0 ? 'up' : 'neutral'} />
        <StatCard onClick={() => navigate('/admin/projects')} title="Running Projects" value={String(s.runningProjects)} icon={Briefcase} change={s.runningProjects > 0 ? 'Active' : 'None'} changeType={s.runningProjects > 0 ? 'up' : 'neutral'} />
        <StatCard onClick={() => navigate('/admin/projects')} title="Completed This Month" value={String(s.completedThisMonth)} icon={CheckCircle2} change={s.completedThisMonth > 0 ? 'This month' : 'None yet'} changeType={s.completedThisMonth > 0 ? 'up' : 'neutral'} />
        <StatCard onClick={() => navigate('/leads/bin')} title="Cancelled Leads" value={String(s.cancelledLeads)} icon={XCircle} change={s.cancelledLeads > 0 ? `${s.cancelledLeads} cancelled` : 'All clear'} changeType={s.cancelledLeads > 0 ? 'down' : 'neutral'} />
        <StatCard onClick={() => navigate('/admin/projects')} title="Pending Documents" value={String(s.pendingDocuments)} icon={FileText} change="Awaiting upload" changeType={s.pendingDocuments > 0 ? 'down' : 'neutral'} />
        <StatCard onClick={() => navigate('/admin/projects')} title="Revenue This Month" value={`₹${s.revenueThisMonth > 0 ? (s.revenueThisMonth / 100000).toFixed(1) + 'L' : '0'}`} icon={IndianRupee} change={s.revenueThisMonth > 0 ? 'This month' : 'No revenue yet'} changeType={s.revenueThisMonth > 0 ? 'up' : 'neutral'} />
        <StatCard onClick={() => navigate('/leads')} title="Overdue Follow-ups" value={String(s.overdueFollowUps)} icon={Clock} change={s.overdueFollowUps > 0 ? 'Needs attention' : 'All clear'} changeType={s.overdueFollowUps > 0 ? 'down' : 'neutral'} />
        <StatCard onClick={() => navigate('/admin/projects')} title="Pending Loan Files" value={String(s.pendingLoanFiles)} icon={FolderOpen} change={s.pendingLoanFiles > 0 ? 'In process' : 'None'} changeType={s.pendingLoanFiles > 0 ? 'down' : 'neutral'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="shadow-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/staff')}><Users className="mr-2 h-4 w-4" /> View All Staff</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/staff/new')}><UserPlus className="mr-2 h-4 w-4" /> Add Staff Member</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/leads')}><FileText className="mr-2 h-4 w-4" /> View All Leads</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/admin/projects')}><FolderOpen className="mr-2 h-4 w-4" /> View All Projects</Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 shadow-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activity.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 rounded-md bg-accent shrink-0">
                    <item.icon className="h-3.5 w-3.5 text-accent-foreground" />
                  </div>
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
    </div>
  );
};

export default AdminDashboard;
