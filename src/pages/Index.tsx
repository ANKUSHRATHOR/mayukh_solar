import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import AdminDashboard from './AdminDashboard';
import TelecallerDashboard from './TelecallerDashboard';
import SalesPersonDashboard from './SalesPersonDashboard';
import { Loader2 } from 'lucide-react';
import { Navigate } from 'react-router-dom';

const Index = () => {
  const { user, role, staff, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Force password change on first login
  if (staff?.must_change_password) {
    return <Navigate to="/set-password" replace />;
  }

  // Route based on role
  const renderDashboard = () => {
    switch (role) {
      case 'admin':
        return <AdminDashboard />;
      case 'telecaller':
        return <ComingSoonDashboard role="Telecaller" />;
      case 'sales_person':
        return <ComingSoonDashboard role="Sales Person" />;
      case 'operator':
        return <ComingSoonDashboard role="Operator" />;
      case 'welder':
        return <ComingSoonDashboard role="Welder" />;
      case 'electrician':
        return <ComingSoonDashboard role="Electrician" />;
      default:
        return <ComingSoonDashboard role="User" />;
    }
  };

  return <AppLayout>{renderDashboard()}</AppLayout>;
};

const ComingSoonDashboard = ({ role }: { role: string }) => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
    <div className="h-16 w-16 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-2xl font-bold mb-4">
      {role.charAt(0)}
    </div>
    <h2 className="text-xl font-bold text-foreground">{role} Dashboard</h2>
    <p className="text-muted-foreground mt-2 max-w-md">
      Your dashboard is being built. It will be available in the next phase.
    </p>
  </div>
);

export default Index;
