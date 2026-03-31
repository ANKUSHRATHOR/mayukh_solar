import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  LogOut,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
  PhoneCall,
  Briefcase,
  ClipboardCheck,
  Wrench,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import logo from '@/assets/mayukh-solar-logo.png';

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
}

const adminNav: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'All Leads', icon: PhoneCall, path: '/leads' },
  { label: 'Staff Management', icon: Users, path: '/staff' },
  { label: 'Notifications', icon: Bell, path: '/notifications' },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

const telecallerNav: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Create Lead', icon: PhoneCall, path: '/leads/new' },
];

const salesNav: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'My Leads', icon: Briefcase, path: '/' },
];

const operatorNav: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Projects', icon: ClipboardCheck, path: '/' },
];

const AppSidebar = () => {
  const { staff, role, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = role === 'admin' ? adminNav : role === 'telecaller' ? telecallerNav : role === 'sales_person' ? salesNav : role === 'operator' ? operatorNav : [];

  const roleLabel = role ? role.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';

  return (
    <aside
      className={cn(
        'h-screen flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-sidebar-border">
        <img src={logo} alt="Mayukh Solar" width={36} height={36} className="shrink-0" />
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-bold text-sm truncate text-sidebar-primary-foreground">Mayukh Solar</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">{roleLabel}</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto p-1 rounded hover:bg-sidebar-accent transition-colors shrink-0"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-sidebar-border">
        {!collapsed && staff && (
          <div className="mb-2 px-2">
            <p className="text-sm font-medium truncate">{staff.full_name}</p>
            <p className="text-xs text-sidebar-foreground/50 truncate">{staff.mobile}</p>
          </div>
        )}
        <Button
          onClick={signOut}
          variant="ghost"
          className={cn(
            'w-full text-sidebar-foreground/70 hover:text-destructive hover:bg-sidebar-accent',
            collapsed ? 'justify-center px-0' : 'justify-start'
          )}
          size="sm"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="ml-2">Sign Out</span>}
        </Button>
      </div>
    </aside>
  );
};

export default AppSidebar;
