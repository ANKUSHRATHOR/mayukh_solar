import { describe, it, expect } from 'vitest';
import {
  ALL_ROLES,
  MODULE_KEYS,
  DEFAULT_ROLE_MODULES,
  defaultAllowed,
  roleLabel,
  type AppRole,
  type ModuleKey,
} from '@/lib/modules';

// Mirrors the DB seed in 20260724000000_role_permissions.sql and the access
// model the Roles & Access UI + sidebar + route guards all read from.

describe('role access model', () => {
  it('admin has every module', () => {
    MODULE_KEYS.forEach((m) => expect(defaultAllowed('admin', m)).toBe(true));
  });

  it('telecaller and sales_person get crm + site_visits + projects', () => {
    (['telecaller', 'sales_person'] as AppRole[]).forEach((role) => {
      expect(defaultAllowed(role, 'crm')).toBe(true);
      expect(defaultAllowed(role, 'site_visits')).toBe(true);
      expect(defaultAllowed(role, 'projects')).toBe(true);
    });
  });

  it('trade roles get projects but not crm or site_visits', () => {
    (['welder', 'electrician'] as AppRole[]).forEach((role) => {
      expect(defaultAllowed(role, 'projects')).toBe(true);
      expect(defaultAllowed(role, 'crm')).toBe(false);
      expect(defaultAllowed(role, 'site_visits')).toBe(false);
    });
  });

  // Operator was grouped with the trades until an admin switched crm on for
  // them in production on 2026-08-01; the defaults now match that intent rather
  // than contradicting the live table.
  it('operator gets crm and operations but not site_visits', () => {
    expect(defaultAllowed('operator', 'crm')).toBe(true);
    expect(defaultAllowed('operator', 'operations')).toBe(true);
    expect(defaultAllowed('operator', 'projects')).toBe(true);
    expect(defaultAllowed('operator', 'site_visits')).toBe(false);
  });

  // The projects module used to unlock the payments pages too, which handed a
  // ledger to three roles that project_payments gives no rows to.
  it('payments and operations are narrower than projects', () => {
    (['telecaller', 'welder', 'electrician'] as AppRole[]).forEach((role) => {
      expect(defaultAllowed(role, 'projects')).toBe(true);
      expect(defaultAllowed(role, 'payments')).toBe(false);
      expect(defaultAllowed(role, 'operations')).toBe(false);
    });
    expect(defaultAllowed('sales_person', 'payments')).toBe(true);
    expect(defaultAllowed('sales_person', 'operations')).toBe(false);
    expect(defaultAllowed('admin', 'payments')).toBe(true);
    expect(defaultAllowed('admin', 'operations')).toBe(true);
  });

  it('every role gets the common utility modules by default', () => {
    const common: ModuleKey[] = ['tasks', 'attendance', 'contacts'];
    ALL_ROLES.forEach((role) => {
      common.forEach((m) => expect(defaultAllowed(role, m)).toBe(true));
    });
  });

  it('DEFAULT_ROLE_MODULES covers every role and only valid module keys', () => {
    ALL_ROLES.forEach((role) => {
      expect(DEFAULT_ROLE_MODULES[role]).toBeDefined();
      DEFAULT_ROLE_MODULES[role].forEach((m) => expect(MODULE_KEYS).toContain(m));
    });
  });

  it('labels sales_person as "Sales Rep"', () => {
    expect(roleLabel('sales_person')).toBe('Sales Rep');
    expect(roleLabel('telecaller')).toBe('Telecaller');
  });
});
