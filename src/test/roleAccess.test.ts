import { describe, it, expect } from 'vitest';
import { adminNav, buildNav, NAV_ROUTE_GATES } from '@/lib/nav';
import { ALL_ROLES, DEFAULT_ROLE_MODULES, type AppRole, type ModuleKey } from '@/lib/modules';

/**
 * The nav must never advertise a screen the role would be bounced out of.
 *
 * ProtectedRoute answers a failed gate with a silent `<Navigate to="/">`, so a
 * mismatch here is invisible in testing: the item is there, the click appears to
 * do nothing, and you are back on the dashboard. Before the module split every
 * buildNav entry happened to be gated on the same module that gated its route,
 * which made the invariant true by luck rather than by construction.
 */

/** Mirrors AuthContext.hasModule, including the admin bypass. */
const hasModuleFor = (role: AppRole) => (m: ModuleKey) =>
  role === 'admin' || DEFAULT_ROLE_MODULES[role].includes(m);

const navFor = (role: AppRole) => (role === 'admin' ? adminNav : buildNav(hasModuleFor(role), role));

const paths = (role: AppRole) => navFor(role).flatMap((s) => s.items.map((i) => i.path));

/** Mirrors ProtectedRoute: allowedRoles first, then module; admin bypasses both. */
const canEnter = (role: AppRole, path: string): boolean => {
  const gate = NAV_ROUTE_GATES[path];
  if (!gate) throw new Error(`${path} is linked in the sidebar but absent from NAV_ROUTE_GATES`);
  if (gate.roles && !gate.roles.includes(role)) return false;
  if (gate.module) return hasModuleFor(role)(gate.module);
  return true;
};

describe('role access', () => {
  describe('every nav item leads somewhere the role can actually go', () => {
    for (const role of ALL_ROLES) {
      it(role, () => {
        const dead = paths(role).filter((p) => !canEnter(role, p));
        expect(dead).toEqual([]);
      });
    }
  });

  it('every linked path declares a gate', () => {
    const linked = new Set(ALL_ROLES.flatMap(paths));
    const undeclared = [...linked].filter((p) => !(p in NAV_ROUTE_GATES));
    expect(undeclared).toEqual([]);
  });

  describe('the module split actually narrowed things', () => {
    // These three hold the `projects` module but project_payments gives them no
    // rows, which is the whole reason payments became its own module.
    for (const role of ['telecaller', 'welder', 'electrician'] as AppRole[]) {
      it(`${role} is not offered payments`, () => {
        expect(paths(role)).toContain('/projects');
        expect(paths(role)).not.toContain('/payments');
      });
    }

    it('admin, sales and operator keep payments', () => {
      for (const role of ['admin', 'sales_person', 'operator'] as AppRole[]) {
        expect(paths(role)).toContain('/payments');
      }
    });
  });

  it('telecaller creates leads from My Leads, not a second sidebar entry', () => {
    expect(paths('telecaller')).toContain('/leads');
    expect(paths('telecaller')).not.toContain('/leads/new');
    // The duplication is only removed where it was asked for; the other CRM
    // roles still have the shortcut.
    expect(paths('sales_person')).toContain('/leads/new');
    expect(paths('operator')).toContain('/leads/new');
  });

  it('admin can reach attendance and the directory from the sidebar', () => {
    // The admin list is hardcoded rather than derived, so routes every other
    // role gets through buildNav had simply been left out of it.
    expect(paths('admin')).toContain('/attendance');
    expect(paths('admin')).toContain('/contacts');
  });

  it('no role is offered a duplicate destination', () => {
    for (const role of ALL_ROLES) {
      const p = paths(role);
      expect(p.length).toBe(new Set(p).size);
    }
  });
});
