import { describe, it, expect } from 'vitest';
import {
  canReadPayments,
  canAddPayment,
  canEditPayment,
  canDeletePayment,
  canUploadProjectDoc,
  canBulkAssignLeads,
  canBinLeads,
  canAssignTradeStaff,
} from '@/lib/capabilities';
import { ALL_ROLES, type AppRole } from '@/lib/modules';

/**
 * The whole six-role matrix, pinned.
 *
 * These helpers only earn their place if they cannot quietly drift from the RLS
 * policies they mirror, so the expectations are written out per role rather than
 * derived from the implementation — a table that restates the code proves
 * nothing. When a policy changes, this file should fail.
 */
const matrix: Record<string, Record<AppRole, boolean>> = {
  canReadPayments: {
    admin: true, operator: true, sales_person: true,
    telecaller: false, welder: false, electrician: false,
  },
  canAddPayment: {
    admin: true, operator: true, sales_person: true,
    telecaller: false, welder: false, electrician: false,
  },
  canEditPayment: {
    admin: true, operator: false, sales_person: false,
    telecaller: false, welder: false, electrician: false,
  },
  canDeletePayment: {
    admin: true, operator: false, sales_person: false,
    telecaller: false, welder: false, electrician: false,
  },
  canUploadProjectDoc: {
    admin: true, sales_person: true,
    operator: false, telecaller: false, welder: false, electrician: false,
  },
  canBulkAssignLeads: {
    admin: true, operator: true,
    sales_person: false, telecaller: false, welder: false, electrician: false,
  },
  canBinLeads: {
    admin: true,
    operator: false, sales_person: false, telecaller: false, welder: false, electrician: false,
  },
  canAssignTradeStaff: {
    admin: true, operator: true,
    sales_person: false, telecaller: false, welder: false, electrician: false,
  },
};

const fns: Record<string, (r: AppRole | null | undefined) => boolean> = {
  canReadPayments,
  canAddPayment,
  canEditPayment,
  canDeletePayment,
  canUploadProjectDoc,
  canBulkAssignLeads,
  canBinLeads,
  canAssignTradeStaff,
};

describe('capabilities', () => {
  for (const [name, expectations] of Object.entries(matrix)) {
    describe(name, () => {
      for (const role of ALL_ROLES) {
        const want = expectations[role];
        it(`${want ? 'allows' : 'refuses'} ${role}`, () => {
          expect(fns[name](role)).toBe(want);
        });
      }

      // A signed-out or role-less user must never be handed a control. Index
      // shows "Pending Approval" in that state, but a null role can also reach
      // these helpers during the window before the profile resolves.
      it('refuses a null role', () => {
        expect(fns[name](null)).toBe(false);
        expect(fns[name](undefined)).toBe(false);
      });
    });
  }

  it('covers every role in ALL_ROLES', () => {
    for (const expectations of Object.values(matrix)) {
      expect(Object.keys(expectations).sort()).toEqual([...ALL_ROLES].sort());
    }
  });
});
