import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type AppRole = Database['public']['Enums']['app_role'];

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles: AppRole[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, role, loading, staff, profileResolved } = useAuth();

  if (loading || (user && !profileResolved)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (staff?.must_change_password) return <Navigate to="/set-password" replace />;
  if (!role || !staff || !staff.is_active) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
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
  if (!allowedRoles.includes(role)) return <Navigate to="/" replace />;

  return <AppLayout>{children}</AppLayout>;
};

export default ProtectedRoute;
