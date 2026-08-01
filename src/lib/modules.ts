import type { LucideIcon } from 'lucide-react';
import { PhoneCall, MapPin, Briefcase, CheckSquare, CalendarCheck, Contact } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

export type AppRole = Database['public']['Enums']['app_role'];

/**
 * Feature modules whose access is configurable per role in the "Roles & Access"
 * UI. Utilities that every active user always gets (dashboard, profile,
 * settings) are intentionally NOT modules — they are never gated.
 */
export type ModuleKey =
  | 'crm'
  | 'site_visits'
  | 'projects'
  | 'tasks'
  | 'attendance'
  | 'contacts';

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const MODULES: ModuleDef[] = [
  { key: 'crm', label: 'CRM', description: 'Leads, deals & field visits', icon: PhoneCall },
  { key: 'site_visits', label: 'Site Visits', description: 'Schedule & complete site visits', icon: MapPin },
  { key: 'projects', label: 'Projects', description: 'Installation projects & tasks', icon: Briefcase },
  { key: 'tasks', label: 'Tasks', description: 'Personal task list', icon: CheckSquare },
  { key: 'attendance', label: 'Attendance', description: 'Punch in/out & monthly view', icon: CalendarCheck },
  { key: 'contacts', label: 'Contacts', description: 'Team phone directory', icon: Contact },
];

export const MODULE_KEYS: ModuleKey[] = MODULES.map((m) => m.key);

/**
 * In-code fallback used when the role_permissions table is empty or the
 * migration has not been applied yet. Keeps the app fully functional and
 * mirrors the migration seed. Admin implicitly has every module.
 */
export const DEFAULT_ROLE_MODULES: Record<AppRole, ModuleKey[]> = {
  admin: [...MODULE_KEYS],
  telecaller: ['crm', 'site_visits', 'projects', 'tasks', 'attendance', 'contacts'],
  sales_person: ['crm', 'site_visits', 'projects', 'tasks', 'attendance', 'contacts'],
  operator: ['projects', 'tasks', 'attendance', 'contacts'],
  welder: ['projects', 'tasks', 'attendance', 'contacts'],
  electrician: ['projects', 'tasks', 'attendance', 'contacts'],
};

export const defaultAllowed = (role: AppRole, module: ModuleKey): boolean =>
  role === 'admin' || DEFAULT_ROLE_MODULES[role]?.includes(module) === true;

export const ALL_ROLES: AppRole[] = [
  'admin',
  'telecaller',
  'sales_person',
  'operator',
  'welder',
  'electrician',
];

export const roleLabel = (r: AppRole): string =>
  r === 'sales_person' ? 'Sales Rep' : r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
