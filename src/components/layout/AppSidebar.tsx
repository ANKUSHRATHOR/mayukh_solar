import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  LogOut,
  Settings,
  ChevronLeft,
  ChevronRight,
  PhoneCall,
  Briefcase,
  ClipboardCheck,
  Wrench,
  Zap,
  Trash2,
  FileText,
  ShieldCheck,
  CalendarCheck,
  Wallet,
  MapPin,
  CheckSquare,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import logo from '@/assets/mayukh-solar-logo.png';

interface AppSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
}

const adminNav: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'All Leads', icon: PhoneCall, path: '/leads' },
  { label: 'All Projects', icon: Briefcase, path: '/admin/projects' },
  { label: 'Cancelled Bin', icon: Trash2, path: '/leads/bin' },
  { label: 'Staff Management', icon: Users, path: '/staff' },
  { label: 'Tasks', icon: CheckSquare, path: '/tasks' },
  { label: 'Performance', icon: ShieldCheck, path: '/admin/performance' },
  { label: 'Attendance', icon: CalendarCheck, path: '/admin/attendance' },
  { label: 'Salary', icon: Wallet, path: '/admin/salary' },
  { label: 'Quotations', icon: FileText, path: '/quotations' },
  { label: 'Import Quote PDF', icon: FileText, path: '/admin/quotation-import' },
  { label: 'Activity Logs', icon: ShieldCheck, path: '/activity-logs' },
  { label: 'Admin Settings', icon: Settings, path: '/admin/settings' },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

const telecallerNav: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Create Lead', icon: PhoneCall, path: '/leads/new' },
  { label: 'My Tasks', icon: CheckSquare, path: '/tasks' },
  { label: 'Punch In/Out', icon: CalendarCheck, path: '/attendance' },
  { label: 'My Monthly', icon: CalendarCheck, path: '/my-attendance' },
];

const salesNav: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'My Leads', icon: Briefcase, path: '/' },
  { label: 'Field Visit', icon: MapPin, path: '/field-visit' },
  { label: 'My Tasks', icon: CheckSquare, path: '/tasks' },
  { label: 'Punch In/Out', icon: CalendarCheck, path: '/attendance' },
  { label: 'My Monthly', icon: CalendarCheck, path: '/my-attendance' },
];

const operatorNav: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Projects', icon: ClipboardCheck, path: '/' },
  { label: 'My Tasks', icon: CheckSquare, path: '/tasks' },
  { label: 'Punch In/Out', icon: CalendarCheck, path: '/attendance' },
  { label: 'My Monthly', icon: CalendarCheck, path: '/my-attendance' },
];

const welderNav: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Installations', icon: Wrench, path: '/' },
  { label: 'My Tasks', icon: CheckSquare, path: '/tasks' },
  { label: 'Punch In/Out', icon: CalendarCheck, path: '/attendance' },
  { label: 'My Monthly', icon: CalendarCheck, path: '/my-attendance' },
];

const electricianNav: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Wiring Jobs', icon: Zap, path: '/' },
  { label: 'My Tasks', icon: CheckSquare, path: '/tasks' },
  { label: 'Punch In/Out', icon: CalendarCheck, path: '/attendance' },
  { label: 'My Monthly', icon: CalendarCheck, path: '/my-attendance' },
];

const AppSidebar = ({ mobileOpen = false, onMobileClose }: AppSidebarProps) => {
  const { staff, role, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = role === 'admin' ? adminNav : role === 'telecaller' ? telecallerNav : role === 'sales_person' ? salesNav : role === 'operator' ? operatorNav : role === 'welder' ? welderNav : role === 'electrician' ? electricianNav : [];

  const roleLabel = role ? role.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';

  const handleNavigate = (path: string) => {
    navigate(path);
    onMobileClose?.();
  };

  return (
    <>
      <div
        onClick={onMobileClose}
        className={cn(
          'fixed inset-0 z-40 bg-sidebar/70 backdrop-blur-[1px] transition-opacity duration-300 ease-in-out lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        aria-hidden="true"
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-dvh w-[82vw] max-w-sm flex-col overflow-hidden border-r border-primary/20 bg-primary text-primary-foreground shadow-elevated transition-transform duration-300 ease-in-out lg:static lg:z-auto lg:h-screen lg:bg-sidebar lg:text-sidebar-foreground lg:shadow-none',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          collapsed ? 'lg:w-16' : 'lg:w-64'
        )}
      >
      {/* Header */}
      <div className="flex min-h-28 items-center gap-4 border-b border-border bg-card p-5 text-card-foreground lg:min-h-0 lg:border-sidebar-border lg:bg-sidebar lg:p-4 lg:text-sidebar-foreground">
        <img src={logo} alt="Mayukh Solar" width={64} height={64} className="h-16 w-16 shrink-0 rounded-full bg-background p-1 shadow-card lg:h-9 lg:w-9 lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none" />
        <div className={cn('min-w-0', collapsed && 'lg:hidden')}>
          <p className="truncate text-2xl font-bold leading-tight text-foreground lg:text-sm lg:text-sidebar-primary-foreground">Mayukh Solar</p>
          <p className="mt-1 truncate text-sm text-muted-foreground lg:mt-0 lg:text-xs lg:text-sidebar-foreground/60">{roleLabel}</p>
          {staff && <p className="mt-1 truncate text-xs text-muted-foreground lg:hidden">{staff.full_name}</p>}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto hidden p-1 rounded hover:bg-sidebar-accent transition-colors shrink-0 lg:inline-flex"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
        <button
          onClick={onMobileClose}
          className="ml-auto inline-flex rounded p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground shrink-0 lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-4 lg:p-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => handleNavigate(item.path)}
              className={cn(
                'w-full flex items-center gap-5 rounded-md px-2 py-4 text-left text-lg font-semibold transition-all lg:gap-3 lg:px-3 lg:py-2.5 lg:text-sm lg:font-medium',
                isActive
                  ? 'bg-primary-foreground/15 text-primary-foreground lg:bg-sidebar-primary lg:text-sidebar-primary-foreground'
                  : 'text-primary-foreground/90 hover:bg-primary-foreground/10 hover:text-primary-foreground lg:text-sidebar-foreground/70 lg:hover:text-sidebar-foreground lg:hover:bg-sidebar-accent'
              )}
            >
              <item.icon className="h-7 w-7 shrink-0 lg:h-5 lg:w-5" />
              <span className={cn(collapsed && 'lg:hidden')}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-primary-foreground/20 p-4 lg:border-sidebar-border lg:p-3">
        {staff && (
          <div className={cn('mb-3 px-2', collapsed && 'lg:hidden')}>
            <p className="truncate text-sm font-semibold text-primary-foreground lg:text-sidebar-foreground">{staff.full_name}</p>
            <p className="truncate text-xs text-primary-foreground/70 lg:text-sidebar-foreground/50">{staff.mobile}</p>
          </div>
        )}
        <Button
          onClick={signOut}
          variant="ghost"
          className={cn(
            'w-full justify-start text-primary-foreground/90 hover:bg-primary-foreground/10 hover:text-primary-foreground lg:text-sidebar-foreground/70 lg:hover:text-destructive lg:hover:bg-sidebar-accent',
            collapsed ? 'lg:justify-center lg:px-0' : 'justify-start'
          )}
          size="sm"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className={cn('ml-2', collapsed && 'lg:hidden')}>Sign Out</span>
        </Button>
      </div>
      </aside>
    </>
  );
};

export default AppSidebar;
