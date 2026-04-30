import { ReactNode, useState } from 'react';
import AppSidebar from './AppSidebar';
import NotificationPanel from '@/components/notifications/NotificationPanel';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const { staff } = useAuth();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <AppSidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-border flex items-center justify-between lg:justify-end px-3 sm:px-4 gap-3 shrink-0 bg-card">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden shrink-0"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1 lg:hidden">
            <p className="truncate text-sm font-semibold text-foreground">Mayukh Solar</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
          <NotificationPanel />
          {staff && (
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-foreground leading-tight">{staff.full_name}</p>
            </div>
          )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
