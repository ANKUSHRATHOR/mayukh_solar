import { describe, it, expect } from 'vitest';
import {
  leadStatusMeta,
  projectStatusMeta,
  resolveStatus,
  humanizeStatus,
  toneClasses,
} from '@/lib/statusMeta';

// The enum values as generated in src/integrations/supabase/types.ts.
const LEAD_STATUSES = [
  'new',
  'visited',
  'follow_up',
  'interested',
  'not_interested',
  'cancelled',
  'final',
  'visit_created',
  'quotation_sent',
  'quotation_accepted',
  'quotation_rejected',
];

const PROJECT_STATUSES = [
  'pending_documents',
  'pending_operator_review',
  'registration_pending',
  'registration_done',
  'loan_process',
  'loan_done',
  'cash_file',
  'material_ordered',
  'material_dispatched',
  'material_delivered',
  'installation_pending',
  'installation_done',
  'wiring_pending',
  'wiring_done',
  'net_metering_submitted',
  'inspection_scheduled',
  'inspection_completed',
  'inspection_failed',
  'net_meter_installed',
  'project_completed',
];

describe('status maps cover their enums', () => {
  // The bug this guards: AdminLeadsList's own map covered 7 of 11 statuses, so
  // a "Quotation Accepted" lead rendered identically to a brand-new one.
  it.each(LEAD_STATUSES)('lead_status %s is mapped', (status) => {
    expect(leadStatusMeta[status]).toBeDefined();
  });

  it.each(PROJECT_STATUSES)('project_status %s is mapped', (status) => {
    expect(projectStatusMeta[status]).toBeDefined();
  });

  it('has no map entries for values outside the enums', () => {
    expect(Object.keys(leadStatusMeta).sort()).toEqual([...LEAD_STATUSES].sort());
    expect(Object.keys(projectStatusMeta).sort()).toEqual([...PROJECT_STATUSES].sort());
  });

  it('uses only defined tones', () => {
    const tones = Object.keys(toneClasses);
    for (const meta of [...Object.values(leadStatusMeta), ...Object.values(projectStatusMeta)]) {
      expect(tones).toContain(meta.tone);
    }
  });
});

describe('resolveStatus', () => {
  it('returns the mapped label and tone', () => {
    expect(resolveStatus(leadStatusMeta, 'quotation_accepted')).toEqual({
      label: 'Quotation Accepted',
      tone: 'success',
    });
  });

  // An unmapped value must be visibly plain, not miscoloured as another status.
  it('falls back to a neutral humanized label for unknown values', () => {
    expect(resolveStatus(leadStatusMeta, 'some_new_status')).toEqual({
      label: 'Some New Status',
      tone: 'neutral',
    });
  });

  it('handles null and undefined without throwing', () => {
    expect(resolveStatus(leadStatusMeta, null).label).toBe('—');
    expect(resolveStatus(leadStatusMeta, undefined).label).toBe('—');
    expect(resolveStatus(leadStatusMeta, '').label).toBe('—');
  });
});

describe('humanizeStatus', () => {
  it('title-cases underscore-separated values', () => {
    expect(humanizeStatus('net_metering_submitted')).toBe('Net Metering Submitted');
    expect(humanizeStatus('new')).toBe('New');
  });

  it('ignores repeated and trailing underscores', () => {
    expect(humanizeStatus('a__b_')).toBe('A B');
  });
});
