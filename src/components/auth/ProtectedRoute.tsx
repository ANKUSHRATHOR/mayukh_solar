import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import { Loader2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { PendingApprovalScreen, ProfileErrorScreen } from './ProfileGateScreens';
import type { ModuleKey } from '@/lib/modules';

type AppRole = Database['public']['Enums']['app_role'];

interface ProtectedRouteProps {
  children: ReactNode;
  /** Coarse role gate. Use for admin-only management routes. */
  allowedRoles?: AppRole[];
  /**
   * Feature-module gate driven by the role's configurable access. When set, the
   * route is allowed only if the current role has this module (admin bypasses).
   */
  module?: ModuleKey;
}

const ProtectedRoute = ({ children, allowedRoles, module }: ProtectedRouteProps) => {
  const { user, role, loading, staff, profileResolved, profileError, refreshProfile, hasModule } =
    useAuth();

  if (loading || (user && !profileResolved)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (staff?.must_change_password) return <Navigate to="/set-password" replace />;
  // A failed lookup is not the same as a missing role, and on a cold load there
  // is no cached profile to fall back on — so without this branch a transient
  // 504 renders "pending approval" on every gated route.
  if (profileError && (!role || !staff)) return <ProfileErrorScreen onRetry={() => refreshProfile()} />;

  if (!role || !staff || !staff.is_active) return <PendingApprovalScreen />;

  if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/" replace />;
  if (module && !hasModule(module)) return <Navigate to="/" replace />;

  return <AppLayout>{children}</AppLayout>;
};

export default ProtectedRoute;
