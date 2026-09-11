import { describe, expect, it } from 'vitest';
import { stageBlockers, type StageGateFacts } from '@/lib/projectStages';

/**
 * These cases mirror `can_advance_project` in
 * 20260719000100_migrate_project_stages.sql. If that function's predicates
 * change, these are what should fail.
 */
const allDone: StageGateFacts = {
  documents_uploaded: true,
  documents_verified: true,
  home_location_saved: true,
  serial_numbers_entered: true,
  welder_work_done: true,
  electrician_work_done: true,
  structure_photo_uploaded: true,
  wiring_photo_uploaded: true,
  loan_first_installment_received: true,
  is_loan: false,
  fully_paid: true,
};

const facts = (overrides: Partial<StageGateFacts>): StageGateFacts => ({ ...allDone, ...overrides });

describe('stageBlockers', () => {
  it('lets a ready project into every gated stage', () => {
    for (const stage of [
      'documents_approved',
      'installation_scheduled',
      'installation_completed',
      'net_meter_applied',
      'net_meter_installed',
      'project_completed',
      'closed',
    ]) {
      expect(stageBlockers(stage, allDone)).toEqual([]);
    }
  });

  it('never blocks the ungated stages', () => {
    for (const stage of ['new_project', 'documents_pending', 'payment_pending']) {
      expect(stageBlockers(stage, facts({ documents_uploaded: false, fully_paid: false }))).toEqual([]);
    }
  });

  it('permits legacy stages, so historical rows are never trapped', () => {
    // The server's CASE falls through to `RETURN true` for these.
    expect(stageBlockers('pending_operator_review', facts({ fully_paid: false }))).toEqual([]);
    expect(stageBlockers('wiring_done', facts({ documents_verified: false }))).toEqual([]);
  });

  it('blocks documents_approved until documents are uploaded and verified', () => {
    expect(stageBlockers('documents_approved', facts({ documents_uploaded: false }))).toHaveLength(1);
    expect(stageBlockers('documents_approved', facts({ documents_verified: false }))).toHaveLength(1);
    expect(
      stageBlockers('documents_approved', facts({ documents_uploaded: false, documents_verified: false })),
    ).toHaveLength(2);
  });

  it('blocks installation_scheduled without a home location', () => {
    expect(stageBlockers('installation_scheduled', facts({ home_location_saved: false }))).toHaveLength(1);
  });

  it("holds fabrication on a financed file until the bank's first installment lands", () => {
    const loanUnpaid = facts({ is_loan: true, loan_first_installment_received: false });
    expect(stageBlockers('installation_scheduled', loanUnpaid)).toHaveLength(1);

    // The same facts on a cash file are not a blocker at all — the gate is
    // "does a bank pay part of this", not the payment_type string.
    const cashUnpaid = facts({ is_loan: false, loan_first_installment_received: false });
    expect(stageBlockers('installation_scheduled', cashUnpaid)).toEqual([]);
  });

  it('requires both trades and both photos for installation_completed', () => {
    expect(stageBlockers('installation_completed', facts({ welder_work_done: false }))).toHaveLength(1);
    expect(stageBlockers('installation_completed', facts({ structure_photo_uploaded: false }))).toHaveLength(1);
    expect(stageBlockers('installation_completed', facts({ electrician_work_done: false }))).toHaveLength(1);
    expect(stageBlockers('installation_completed', facts({ wiring_photo_uploaded: false }))).toHaveLength(1);

    const nothingDone = facts({
      welder_work_done: false,
      structure_photo_uploaded: false,
      electrician_work_done: false,
      wiring_photo_uploaded: false,
    });
    expect(stageBlockers('installation_completed', nothingDone)).toHaveLength(4);
  });

  it('requires serial numbers for both net meter stages', () => {
    const noSerials = facts({ serial_numbers_entered: false });
    expect(stageBlockers('net_meter_applied', noSerials)).toHaveLength(1);
    expect(stageBlockers('net_meter_installed', noSerials)).toHaveLength(1);
  });

  it('will not complete or close a project that still owes money', () => {
    const owing = facts({ fully_paid: false });
    expect(stageBlockers('project_completed', owing)).toHaveLength(1);
    expect(stageBlockers('closed', owing)).toHaveLength(1);
  });

  it('reserves the loan stages for financed projects', () => {
    expect(stageBlockers('loan_application_pending', facts({ is_loan: false }))).toHaveLength(1);
    expect(stageBlockers('loan_approved', facts({ is_loan: false }))).toHaveLength(1);
    expect(stageBlockers('loan_approved', facts({ is_loan: true }))).toEqual([]);
  });

  it('blocks nothing when the requirements have not loaded yet', () => {
    // The button stays live and the database refuses if it must — better than
    // showing a blocker the app cannot actually justify.
    expect(stageBlockers('project_completed', null)).toEqual([]);
    expect(stageBlockers('project_completed', undefined)).toEqual([]);
  });
});
