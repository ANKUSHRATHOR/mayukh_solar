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

interface NavSection {
  title: string;
  items: NavItem[];
}

const adminNav: NavSection[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', icon: LayoutDashboard, path: '/' }],
  },
  {
    title: 'Sales & Leads',
    items: [
      { label: 'All Leads', icon: PhoneCall, path: '/leads' },
      { label: 'Cancelled Bin', icon: Trash2, path: '/leads/bin' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'All Projects', icon: Briefcase, path: '/admin/projects' },
      { label: 'Tasks', icon: CheckSquare, path: '/tasks' },
      { label: 'Quotations', icon: FileText, path: '/quotations' },
      { label: 'Import Quote PDF', icon: FileText, path: '/admin/quotation-import' },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Staff Management', icon: Users, path: '/staff' },
      { label: 'Performance', icon: ShieldCheck, path: '/admin/performance' },
      { label: 'Attendance', icon: CalendarCheck, path: '/admin/attendance' },
    ],
  },
  {
    title: 'Finance',
    items: [{ label: 'Salary', icon: Wallet, path: '/admin/salary' }],
  },
  {
    title: 'System',
    items: [
      { label: 'Activity Logs', icon: ShieldCheck, path: '/activity-logs' },
      { label: 'Admin Settings', icon: Settings, path: '/admin/settings' },
      { label: 'Settings', icon: Settings, path: '/settings' },
    ],
  },
];

const telecallerNav: NavSection[] = [
  { title: 'Overview', items: [{ label: 'Dashboard', icon: LayoutDashboard, path: '/' }] },
  {
    title: 'Leads',
    items: [
      { label: 'Create Lead', icon: PhoneCall, path: '/leads/new' },
      { label: 'My Tasks', icon: CheckSquare, path: '/tasks' },
    ],
  },
  {
    title: 'Attendance',
    items: [
      { label: 'Punch In/Out', icon: CalendarCheck, path: '/attendance' },
      { label: 'My Monthly', icon: CalendarCheck, path: '/my-attendance' },
    ],
  },
];

const salesNav: NavSection[] = [
  { title: 'Overview', items: [{ label: 'Dashboard', icon: LayoutDashboard, path: '/' }] },
  {
    title: 'Field Work',
    items: [
      { label: 'My Leads', icon: Briefcase, path: '/' },
      { label: 'Field Visit', icon: MapPin, path: '/field-visit' },
      { label: 'My Tasks', icon: CheckSquare, path: '/tasks' },
    ],
  },
  {
    title: 'Attendance',
    items: [
      { label: 'Punch In/Out', icon: CalendarCheck, path: '/attendance' },
      { label: 'My Monthly', icon: CalendarCheck, path: '/my-attendance' },
    ],
  },
];

const operatorNav: NavSection[] = [
  { title: 'Overview', items: [{ label: 'Dashboard', icon: LayoutDashboard, path: '/' }] },
  {
    title: 'Operations',
    items: [
      { label: 'Projects', icon: ClipboardCheck, path: '/' },
      { label: 'My Tasks', icon: CheckSquare, path: '/tasks' },
    ],
  },
  {
    title: 'Attendance',
    items: [
      { label: 'Punch In/Out', icon: CalendarCheck, path: '/attendance' },
      { label: 'My Monthly', icon: CalendarCheck, path: '/my-attendance' },
    ],
  },
];

const welderNav: NavSection[] = [
  { title: 'Overview', items: [{ label: 'Dashboard', icon: LayoutDashboard, path: '/' }] },
  {
    title: 'Field Work',
    items: [
      { label: 'Installations', icon: Wrench, path: '/' },
      { label: 'My Tasks', icon: CheckSquare, path: '/tasks' },
    ],
  },
  {
    title: 'Attendance',
    items: [
      { label: 'Punch In/Out', icon: CalendarCheck, path: '/attendance' },
      { label: 'My Monthly', icon: CalendarCheck, path: '/my-attendance' },
    ],
  },
];

const electricianNav: NavSection[] = [
  { title: 'Overview', items: [{ label: 'Dashboard', icon: LayoutDashboard, path: '/' }] },
  {
    title: 'Field Work',
    items: [
      { label: 'Wiring Jobs', icon: Zap, path: '/' },
      { label: 'My Tasks', icon: CheckSquare, path: '/tasks' },
    ],
  },
  {
    title: 'Attendance',
    items: [
      { label: 'Punch In/Out', icon: CalendarCheck, path: '/attendance' },
      { label: 'My Monthly', icon: CalendarCheck, path: '/my-attendance' },
    ],
  },
];

const AppSidebar = ({ mobileOpen = false, onMobileClose }: AppSidebarProps) => {
  const { staff, role, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const navSections: NavSection[] =
    role === 'admin' ? adminNav :
    role === 'telecaller' ? telecallerNav :
    role === 'sales_person' ? salesNav :
    role === 'operator' ? operatorNav :
    role === 'welder' ? welderNav :
    role === 'electrician' ? electricianNav : [];



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
          'fixed inset-y-0 left-0 z-50 flex h-dvh w-[82vw] max-w-sm flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-elevated transition-transform duration-300 ease-in-out lg:static lg:z-auto lg:h-screen lg:shadow-none',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          collapsed ? 'lg:w-16' : 'lg:w-64'
        )}
      >
      {/* Header */}
      <div className="flex min-h-20 items-center gap-3 border-b border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
        <img src={logo} alt="Mayukh Solar" width={44} height={44} className="h-11 w-11 shrink-0 rounded-xl bg-background/60 p-1 ring-1 ring-primary/30 lg:h-9 lg:w-9" />
        <div className={cn('min-w-0', collapsed && 'lg:hidden')}>
          <p className="truncate text-base font-bold leading-tight text-display lg:text-sm">Mayukh Solar</p>
          <p className="mt-0.5 truncate text-[11px] uppercase tracking-[0.14em] text-sidebar-foreground/60">{roleLabel}</p>
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto hidden p-1 rounded hover:bg-sidebar-accent transition-colors shrink-0 lg:inline-flex"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
        <button
          onClick={onMobileClose}
          className="ml-auto inline-flex rounded-lg p-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground shrink-0 lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3 lg:p-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => handleNavigate(item.path)}
              className={cn(
                'w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition-all lg:py-2.5',
                isActive
                  ? 'bg-gradient-to-r from-primary/20 to-primary/5 text-primary border border-primary/30 shadow-[0_4px_14px_-6px_hsl(22_96%_55%/0.5)]'
                  : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              )}
            >
              <item.icon className={cn('h-5 w-5 shrink-0', isActive && 'text-primary')} />
              <span className={cn(collapsed && 'lg:hidden')}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-sidebar-border p-3">
        {staff && (
          <div className={cn('mb-2 px-2', collapsed && 'lg:hidden')}>
            <p className="truncate text-sm font-semibold text-sidebar-foreground">{staff.full_name}</p>
            <p className="truncate text-xs text-sidebar-foreground/60">{staff.mobile}</p>
          </div>
        )}
        <Button
          onClick={signOut}
          variant="ghost"
          className={cn(
            'w-full text-sidebar-foreground/75 hover:bg-destructive/10 hover:text-destructive',
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
