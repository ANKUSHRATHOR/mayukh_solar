import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Users, Settings, PhoneCall, Briefcase, ClipboardCheck, Trash2,
  ShieldCheck, CalendarCheck, Wallet, MapPin, CheckSquare, UserCircle, Contact,
  IndianRupee,
} from 'lucide-react';
import type { AppRole, ModuleKey } from '@/lib/modules';

/**
 * The sidebar's contents, and the gate behind every destination it can offer.
 *
 * Lifted out of AppSidebar so the nav and the route table have one place to
 * disagree, and `src/test/roleAccess.test.ts` can hold them to each other. The
 * invariant — every item a role can see points at a route that role can enter —
 * held only by luck before: each buildNav entry happened to be gated on the same
 * module that gated its route, and nothing checked it. Splitting the `projects`
 * module was exactly the kind of change that breaks that silently.
 */

export interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** What ProtectedRoute demands for each path the sidebar can link to. Mirrors src/App.tsx. */
export interface RouteGate {
  module?: ModuleKey;
  roles?: AppRole[];
}

/**
 * Destinations a role does not want in its sidebar, even though its modules
 * grant them. Module access answers "may this role use the feature"; this
 * answers "does this role want the shortcut", which is a workflow question and
 * not a permission one — every path here stays reachable by its own route.
 *
 * Both current entries are the same duplication: My Leads carries Create Lead
 * as its primary action, so a sidebar entry is the same destination twice.
 */
export const NAV_EXCLUSIONS: Partial<Record<AppRole, string[]>> = {
  telecaller: ['/leads/new'],
  sales_person: ['/leads/new', '/deals'],
};

export const NAV_ROUTE_GATES: Record<string, RouteGate> = {
  '/': {},
  '/profile': { roles: ['admin', 'telecaller', 'sales_person', 'operator', 'welder', 'electrician'] },
  '/settings': { roles: ['admin', 'telecaller', 'sales_person', 'operator', 'welder', 'electrician'] },

  '/leads': { module: 'crm' },
  '/leads/new': { module: 'crm' },
  '/deals': { module: 'crm' },
  '/leads/bin': { roles: ['admin'] },

  '/visits': { module: 'site_visits' },

  '/projects': { module: 'projects' },
  '/payments': { module: 'payments' },
  '/tasks': { module: 'tasks' },

  '/attendance': { module: 'attendance' },
  '/my-attendance': { module: 'attendance' },
  '/admin/attendance': { roles: ['admin'] },

  '/contacts': { module: 'contacts' },

  '/users': { roles: ['admin'] },
  '/admin/performance': { roles: ['admin'] },
  '/admin/salary': { roles: ['admin'] },
  '/activity-logs': { roles: ['admin'] },
  '/admin/settings': { roles: ['admin'] },
};

export const adminNav: NavSection[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', icon: LayoutDashboard, path: '/' }],
  },
  {
    title: 'Sales & Leads',
    items: [
      { label: 'All Leads', icon: PhoneCall, path: '/leads' },
      { label: 'Site Visits', icon: MapPin, path: '/visits' },
      { label: 'Deals Dashboard', icon: Briefcase, path: '/deals' },
      { label: 'Cancelled Bin', icon: Trash2, path: '/leads/bin' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Projects', icon: Briefcase, path: '/projects' },
      { label: 'Tasks', icon: CheckSquare, path: '/tasks' },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'User Management', icon: Users, path: '/users' },
      { label: 'Performance', icon: ShieldCheck, path: '/admin/performance' },
      { label: 'Attendance', icon: CalendarCheck, path: '/admin/attendance' },
      // The admin list is hardcoded, so routes every other role reaches through
      // buildNav were simply missing here: an admin could not punch in or open
      // the staff directory from the sidebar at all.
      { label: 'Punch In/Out', icon: CalendarCheck, path: '/attendance' },
      { label: 'Staff Contacts', icon: Contact, path: '/contacts' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Payments', icon: IndianRupee, path: '/payments' },
      { label: 'Salary', icon: Wallet, path: '/admin/salary' },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Activity Logs', icon: ShieldCheck, path: '/activity-logs' },
      { label: 'Admin Settings', icon: Settings, path: '/admin/settings' },
      { label: 'My Profile', icon: UserCircle, path: '/profile' },
      { label: 'Settings', icon: Settings, path: '/settings' },
    ],
  },
];

/**
 * Non-admin navigation is derived from the role's configurable module access
 * (hasModule), so the sidebar always reflects the Roles & Access settings.
 * Overview + Account are always shown; feature sections appear only when the
 * matching module is granted. Empty sections are dropped.
 */
export const buildNav = (
  hasModule: (m: ModuleKey) => boolean,
  role: AppRole | null,
): NavSection[] => {
  const sections: NavSection[] = [
    { title: 'Overview', items: [{ label: 'Dashboard', icon: LayoutDashboard, path: '/' }] },
  ];

  // "My Leads" is the same list the admin sees at /leads; RLS scopes the rows to
  // the ones this user created or was assigned, so the label reflects what they
  // actually get rather than the admin's "All Leads".
  const crm: NavItem[] = hasModule('crm')
    ? [
        { label: 'My Leads', icon: PhoneCall, path: '/leads' },
        { label: 'Create Lead', icon: PhoneCall, path: '/leads/new' },
        { label: 'Deals Dashboard', icon: Briefcase, path: '/deals' },
      ].filter((item) => !(NAV_EXCLUSIONS[role ?? 'admin'] ?? []).includes(item.path))
    : [];
  if (hasModule('site_visits')) crm.push({ label: 'Site Visits', icon: MapPin, path: '/visits' });
  if (crm.length) sections.push({ title: 'Sales & Leads', items: crm });

  const ops: NavItem[] = [];
  if (hasModule('projects')) ops.push({ label: 'Projects', icon: ClipboardCheck, path: '/projects' });
  // Its own module since 20260909100000. Gated on `projects` it appeared for
  // every role, including the three that project_payments RLS gives no rows.
  if (hasModule('payments')) ops.push({ label: 'Payments', icon: IndianRupee, path: '/payments' });
  if (hasModule('tasks')) ops.push({ label: 'My Tasks', icon: CheckSquare, path: '/tasks' });
  if (ops.length) sections.push({ title: 'Work', items: ops });

  if (hasModule('attendance')) {
    sections.push({
      title: 'Attendance',
      items: [
        { label: 'Punch In/Out', icon: CalendarCheck, path: '/attendance' },
        { label: 'My Monthly', icon: CalendarCheck, path: '/my-attendance' },
      ],
    });
  }

  if (hasModule('contacts')) {
    sections.push({ title: 'Team', items: [{ label: 'Staff Contacts', icon: Contact, path: '/contacts' }] });
  }

  sections.push({ title: 'Account', items: [{ label: 'My Profile', icon: UserCircle, path: '/profile' }] });
  return sections;
};
