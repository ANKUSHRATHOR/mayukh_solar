import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import AdminDashboard from './AdminDashboard';
import TelecallerDashboard from './TelecallerDashboard';
import SalesPersonDashboard from './SalesPersonDashboard';
import OperatorDashboard from './OperatorDashboard';
import WelderDashboard from './WelderDashboard';
import ElectricianDashboard from './ElectricianDashboard';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const Index = () => {
  const { user, role, staff, loading, profileResolved, profileError, refreshProfile } = useAuth();

  if (loading || (user && !profileResolved)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (staff?.must_change_password) {
    return <Navigate to="/set-password" replace />;
  }

  // A failed lookup is not the same as a missing role. Saying "pending approval"
  // to an admin whose role query timed out sends them to the wrong person.
  if (profileError && (!staff || !role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-lg space-y-3">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Couldn't load your profile</AlertTitle>
            <AlertDescription>
              We could not reach the server to check your role. This is usually temporary — your
              account is fine.
            </AlertDescription>
          </Alert>
          <Button onClick={() => refreshProfile()} className="w-full gap-2">
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!staff || !role || !staff.is_active) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-lg">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Pending Approval or Inactive Account</AlertTitle>
            <AlertDescription>
              Your account is pending admin approval, inactive, or has not been assigned a role yet. Please contact your administrator to activate your account and assign your role.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  const renderDashboard = () => {
    switch (role) {
      case 'admin':
        return <AdminDashboard />;
      case 'telecaller':
        return <TelecallerDashboard />;
      case 'sales_person':
        return <SalesPersonDashboard />;
      case 'operator':
        return <OperatorDashboard />;
      case 'welder':
        return <WelderDashboard />;
      case 'electrician':
        return <ElectricianDashboard />;
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
