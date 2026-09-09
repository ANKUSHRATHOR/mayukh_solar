import { describe, expect, it } from 'vitest';
import {
  OUTCOME_TO_LEAD_STATUS,
  VISIT_DOCUMENTS,
  VISIT_OUTCOMES,
  findOutcome,
  outcomeLabel,
  outcomeRequiresDocuments,
} from '@/lib/visits';

/**
 * The document gate is the rule worth pinning: paperwork is mandatory only for
 * a customer who has agreed to proceed. Getting this wrong in either direction
 * is costly — too strict and a surveyor cannot close a visit the customer
 * declined; too loose and a won lead reaches the operator with no Aadhaar.
 */
describe('visit outcomes', () => {
  it('requires documents only when the customer is ready to proceed', () => {
    expect(outcomeRequiresDocuments('ready_to_proceed')).toBe(true);

    for (const value of [
      'not_interested',
      'follow_up_needed',
      'revisit_required',
      'reschedule',
    ]) {
      expect(outcomeRequiresDocuments(value)).toBe(false);
    }
  });

  it('treats an unknown or absent outcome as not requiring documents', () => {
    expect(outcomeRequiresDocuments(null)).toBe(false);
    expect(outcomeRequiresDocuments(undefined)).toBe(false);
    expect(outcomeRequiresDocuments('something_else')).toBe(false);
  });

  it('asks for a new date only when rescheduling', () => {
    expect(findOutcome('reschedule')?.reschedules).toBe(true);
    for (const o of VISIT_OUTCOMES.filter((x) => x.value !== 'reschedule')) {
      expect(o.reschedules ?? false).toBe(false);
    }
  });

  it('maps every outcome to a lead status', () => {
    for (const o of VISIT_OUTCOMES) {
      expect(OUTCOME_TO_LEAD_STATUS[o.value]).toBeTruthy();
    }
  });

  it('keeps a rescheduled lead on the open-visit status', () => {
    expect(OUTCOME_TO_LEAD_STATUS.reschedule).toBe('visit_created');
  });

  it('still labels outcomes recorded before the wording changed', () => {
    expect(outcomeLabel('feasible')).toBe('Site feasible — proceed to quotation');
    expect(outcomeLabel('customer_unavailable')).toBe('Customer unavailable');
    expect(outcomeLabel('ready_to_proceed')).toBe('Customer ready to move forward');
  });

  it('falls back to the raw value rather than rendering nothing', () => {
    expect(outcomeLabel('brand_new_value')).toBe('brand_new_value');
    expect(outcomeLabel(null)).toBe('—');
  });

  it('keeps the four on-site documents that gate a ready-to-proceed visit', () => {
    const required = VISIT_DOCUMENTS.filter((d) => d.required).map((d) => d.type);
    expect(required).toEqual([
      'electricity_bill',
      'aadhaar_front',
      'aadhaar_back',
      'overall_structure',
    ]);
  });
});
