import { ReactNode } from 'react';
import AppSidebar from './AppSidebar';
import NotificationPanel from '@/components/notifications/NotificationPanel';
import { useAuth } from '@/contexts/AuthContext';

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const { staff } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-border flex items-center justify-end px-4 gap-3 shrink-0 bg-card">
          <NotificationPanel />
          {staff && (
            <div className="text-right">
              <p className="text-sm font-medium text-foreground leading-tight">{staff.full_name}</p>
            </div>
          )}
        </header>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
