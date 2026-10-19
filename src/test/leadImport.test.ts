import { describe, it, expect } from 'vitest';
import { LEAD_IMPORT_FIELDS, buildUpdatePatch, guessMappings, normalizeMobile, resolveMatch } from '@/lib/leadImport';

describe('normalizeMobile', () => {
  it('strips formatting and the country / trunk prefix', () => {
    expect(normalizeMobile('+91 98765-43210')).toBe('9876543210');
    expect(normalizeMobile('09876543210')).toBe('9876543210');
    expect(normalizeMobile('9876543210')).toBe('9876543210');
  });
});

describe('buildUpdatePatch', () => {
  const mappings = { mobile: 'Phone', k_number: 'KNO', district: 'District', kw_interest: 'kW' };

  it('writes only mapped, non-empty cells and never the match column', () => {
    const r = buildUpdatePatch({ Phone: '9876543210', KNO: '210721033383', District: '', kW: '5' }, mappings, 'mobile', 'Phone');
    expect(r).toEqual({
      ok: true,
      matchValue: '9876543210',
      patch: { k_number: '210721033383', kno_details: null, kw_interest: 5 },
    });
  });

  it('can change the mobile when matching by K Number', () => {
    const r = buildUpdatePatch({ Phone: '8765432109', KNO: '2107 2103 3383' }, mappings, 'k_number', 'KNO');
    expect(r).toMatchObject({ ok: true, matchValue: '210721033383', patch: { mobile: '8765432109' } });
    expect(r.ok && 'k_number' in r.patch).toBe(false);
  });

  it('rejects an invalid match value or field', () => {
    expect(buildUpdatePatch({ Phone: '12345' }, mappings, 'mobile', 'Phone').ok).toBe(false);
    expect(buildUpdatePatch({ Phone: '9876543210', KNO: '123' }, mappings, 'mobile', 'Phone').ok).toBe(false);
  });

  it('refuses a row with nothing to write', () => {
    const r = buildUpdatePatch({ Phone: '9876543210', KNO: '', District: '' }, mappings, 'mobile', 'Phone');
    expect(r.ok).toBe(false);
  });

  it('applies the default campaign when the cell is empty', () => {
    const r = buildUpdatePatch({ Phone: '9876543210' }, { mobile: 'Phone' }, 'mobile', 'Phone', 'Diwali');
    expect(r).toMatchObject({ ok: true, patch: { campaign: 'Diwali' } });
  });
});

describe('resolveMatch', () => {
  const lead = (id: string, k: string, bin = false) => ({ id, mobile: null, k_number: k, is_in_bin: bin });

  it('matches a single live lead', () => {
    expect(resolveMatch('k_number', '210721033383', [lead('a', '210721033383')])).toEqual({ ok: true, id: 'a' });
  });

  it('prefers the live lead over a binned duplicate', () => {
    expect(resolveMatch('k_number', '210721033383', [lead('a', '210721033383', true), lead('b', '210721033383')]))
      .toEqual({ ok: true, id: 'b' });
  });

  it('refuses ambiguous, binned-only and missing matches', () => {
    expect(resolveMatch('k_number', '210721033383', [lead('a', '210721033383'), lead('b', '210721033383')]).ok).toBe(false);
    expect(resolveMatch('k_number', '210721033383', [lead('a', '210721033383', true)])).toEqual({ ok: false, error: 'Lead is in the bin' });
    expect(resolveMatch('k_number', '210721033383', []).ok).toBe(false);
  });
});

describe('guessMappings', () => {
  const guess = (headers: string[]) => guessMappings(headers, LEAD_IMPORT_FIELDS);

  it('maps an Address column to Full Address, not Email Address', () => {
    expect(guess(['Address'])).toEqual({ address: 'Address' });
    expect(guess(['Address', 'Email'])).toEqual({ address: 'Address', email: 'Email' });
  });

  it('maps every header of the sample CSV back to its own field', () => {
    const headers = LEAD_IMPORT_FIELDS.map((f) => f.label.replace(' *', ''));
    expect(guess(headers)).toEqual(Object.fromEntries(LEAD_IMPORT_FIELDS.map((f, i) => [f.key, headers[i]])));
  });

  it('breaks ties on a fragment by field order', () => {
    expect(guess(['Mobile'])).toEqual({ mobile: 'Mobile' });
    expect(guess(['Name'])).toEqual({ customer_name: 'Name' });
  });

  it('does not let a name column claim Feeder Name', () => {
    expect(guess(['Name', 'Consumer Name', 'Feeder'])).toEqual({ customer_name: 'Name', feeder_name: 'Feeder' });
  });

  it('keeps the better header when two compete for one field', () => {
    expect(guess(['Home Address', 'Address'])).toEqual({ address: 'Address' });
  });

  it('ignores tiny fragments', () => {
    expect(guess(['Na', 'e'])).toEqual({});
  });
});
