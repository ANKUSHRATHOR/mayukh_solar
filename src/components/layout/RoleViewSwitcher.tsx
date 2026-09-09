import { Eye, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

/** Every role a preview can be pointed at. `admin` is the way back out. */
const ROLES: { value: AppRole; label: string }[] = [
  { value: 'admin', label: 'Admin (my own view)' },
  { value: 'telecaller', label: 'Telecaller' },
  { value: 'sales_person', label: 'Sales Person' },
  { value: 'operator', label: 'Operator' },
  { value: 'welder', label: 'Welder' },
  { value: 'electrician', label: 'Electrician' },
];

/**
 * Temporary role preview, for checking what each role's app looks like without
 * keeping six test logins.
 *
 * It changes rendering only. RLS decides what the server returns from
 * auth.uid(), which nothing here can touch, so the rows on screen are still the
 * admin's — a previewed welder sees the welder's navigation and dashboard over
 * admin data. Useful for layout and navigation, not for confirming what another
 * role can actually read.
 *
 * Admin-only, and session-scoped so it dies with the tab.
 */
const RoleViewSwitcher = () => {
  const { realRole, viewAsRole, setViewAsRole } = useAuth();

  if (realRole !== 'admin') return null;

  return (
    <Select
      value={viewAsRole ?? 'admin'}
      onValueChange={(v) => setViewAsRole(v as AppRole)}
    >
      <SelectTrigger
        aria-label="Preview the app as another role"
        className={`h-9 w-[130px] gap-1.5 text-xs sm:w-[170px] ${
          viewAsRole ? 'border-warning/50 bg-warning/10 text-warning' : ''
        }`}
      >
        <Eye className="h-3.5 w-3.5 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {ROLES.map((r) => (
          <SelectItem key={r.value} value={r.value} className="text-xs">
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

/**
 * Says, unmissably, that the screen is not this account's own view — and that
 * the data on it is still the admin's.
 */
export const RoleViewBanner = () => {
  const { realRole, viewAsRole, setViewAsRole } = useAuth();

  if (realRole !== 'admin' || !viewAsRole) return null;

  const label = ROLES.find((r) => r.value === viewAsRole)?.label ?? viewAsRole;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-warning/40 bg-warning/10 px-3 py-2 sm:px-4">
      <p className="min-w-0 text-xs text-warning">
        <span className="font-bold">Previewing as {label}.</span>{' '}
        <span className="hidden sm:inline">
          Navigation and dashboards match this role; the records are still yours.
        </span>
      </p>
      <Button
        size="sm"
        variant="outline"
        className="h-8 shrink-0 gap-1.5 border-warning/50 text-xs font-semibold text-warning hover:bg-warning/20"
        onClick={() => setViewAsRole(null)}
      >
        <X className="h-3.5 w-3.5" /> Exit preview
      </Button>
    </div>
  );
};

export default RoleViewSwitcher;
