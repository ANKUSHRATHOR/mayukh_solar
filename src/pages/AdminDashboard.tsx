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
  Bell as BellIcon,
  Activity,
} from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

const activityFeed = [
  { time: '5 min ago', text: 'New lead created by Telecaller — Rajesh Kumar', icon: UserPlus },
  { time: '30 min ago', text: 'Sales Person uploaded documents for MS-2024-0042', icon: FileText },
  { time: '1 hour ago', text: 'Welder completed installation — MS-2024-0039', icon: CheckCircle2 },
  { time: '2 hours ago', text: 'Material dispatched for MS-2024-0041', icon: TrendingUp },
  { time: '3 hours ago', text: 'New staff account created — Vikram Singh (Operator)', icon: Users },
];

const AdminDashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Welcome back. Here's your business overview.</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => navigate('/staff/new')} className="gradient-primary text-primary-foreground font-semibold">
            <UserPlus className="mr-2 h-4 w-4" /> Add Staff
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Leads This Month" value="0" icon={Users} change="No data yet" changeType="neutral" />
        <StatCard title="Running Projects" value="0" icon={Briefcase} change="No data yet" changeType="neutral" />
        <StatCard title="Completed This Month" value="0" icon={CheckCircle2} change="No data yet" changeType="neutral" />
        <StatCard title="Cancelled Leads" value="0" icon={XCircle} change="No data yet" changeType="neutral" />
        <StatCard title="Pending Documents" value="0" icon={FileText} change="Awaiting upload" changeType="neutral" />
        <StatCard title="Revenue This Month" value="₹0" icon={IndianRupee} change="No data yet" changeType="neutral" />
        <StatCard title="Overdue Follow-ups" value="0" icon={Clock} change="All clear" changeType="neutral" />
        <StatCard title="Pending Loan Files" value="0" icon={FolderOpen} change="No data yet" changeType="neutral" />
      </div>

      {/* Quick Actions + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <Card className="shadow-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/staff')}>
              <Users className="mr-2 h-4 w-4" /> View All Staff
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/staff/new')}>
              <UserPlus className="mr-2 h-4 w-4" /> Add Staff Member
            </Button>
            <Button variant="outline" className="w-full justify-start" disabled>
              <FileText className="mr-2 h-4 w-4" /> View Pending Documents
            </Button>
            <Button variant="outline" className="w-full justify-start" disabled>
              <FolderOpen className="mr-2 h-4 w-4" /> View All Projects
            </Button>
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card className="lg:col-span-2 shadow-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activityFeed.map((item, i) => (
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
