import { describe, it, expect } from 'vitest';
import {
  distinctValues,
  applyClause,
  countApplied,
  dateWindow,
  isComplete,
  operatorsFor,
  resolveConditions,
  rowMatcher,
  toPostgrestOr,
  type FilterCondition,
  type FilterField,
} from '@/lib/filterConditions';

interface Row {
  name: string | null;
  kw: number | null;
  status: string | null;
  owner: string | null;
  helper: string | null;
  created_at: string | null;
  due: string | null;
}

const fields: FilterField<Row>[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'kw', label: 'kW', type: 'number' },
  { key: 'status', label: 'Status', type: 'option', options: [{ value: 'new', label: 'New' }, { value: 'final', label: 'Final' }] },
  { key: 'assigned', label: 'Assigned', type: 'option', columns: ['owner', 'helper'] },
  { key: 'created_at', label: 'Created', type: 'date', dateKind: 'timestamp' },
  { key: 'due', label: 'Due', type: 'date', dateKind: 'day' },
];

const row = (r: Partial<Row>): Row => ({
  name: null, kw: null, status: null, owner: null, helper: null, created_at: null, due: null, ...r,
});

const c = (cond: Omit<FilterCondition, 'id'>): FilterCondition => ({ id: 'x', ...cond });

// Wednesday 15 Oct 2026, 10:00 local.
const NOW = new Date(2026, 9, 15, 10, 0, 0);

const matches = (conds: FilterCondition[], r: Row) => rowMatcher(conds, fields, NOW)(r);

describe('isComplete', () => {
  it('requires a value only where the operator needs one', () => {
    expect(isComplete(c({ field: 'name', op: 'contains' }), fields)).toBe(false);
    expect(isComplete(c({ field: 'name', op: 'contains', value: '  ' }), fields)).toBe(false);
    expect(isComplete(c({ field: 'name', op: 'empty' }), fields)).toBe(true);
    expect(isComplete(c({ field: 'kw', op: 'between', value: '1' }), fields)).toBe(false);
    expect(isComplete(c({ field: 'status', op: 'any_of', values: [] }), fields)).toBe(false);
    expect(isComplete(c({ field: 'created_at', op: 'last_n_days', value: '0' }), fields)).toBe(false);
  });

  it('rejects an operator that does not belong to the field type', () => {
    expect(isComplete(c({ field: 'name', op: 'gt', value: '3' }), fields)).toBe(false);
  });

  it('counts only conditions that will apply', () => {
    expect(countApplied([c({ field: 'name', op: 'contains' }), c({ field: 'kw', op: 'empty' })], fields)).toBe(1);
  });
});

describe('text', () => {
  it('matches case-insensitively and treats wildcards literally', () => {
    expect(matches([c({ field: 'name', op: 'contains', value: 'kum' })], row({ name: 'Ramesh Kumawat' }))).toBe(true);
    expect(matches([c({ field: 'name', op: 'is', value: 'kota' })], row({ name: 'Kota' }))).toBe(true);
    expect(matches([c({ field: 'name', op: 'contains', value: '50%' })], row({ name: '50 off' }))).toBe(false);
    expect(matches([c({ field: 'name', op: 'starts_with', value: 'ra' })], row({ name: 'Ramesh' }))).toBe(true);
    expect(matches([c({ field: 'name', op: 'ends_with', value: 'sh' })], row({ name: 'Ramesh' }))).toBe(true);
  });

  it('counts an empty value as "does not contain"', () => {
    expect(matches([c({ field: 'name', op: 'not_contains', value: 'x' })], row({ name: null }))).toBe(true);
    expect(matches([c({ field: 'name', op: 'is_not', value: 'a' })], row({ name: null }))).toBe(true);
  });

  it('treats blank text as empty', () => {
    expect(matches([c({ field: 'name', op: 'empty' })], row({ name: '' }))).toBe(true);
    expect(matches([c({ field: 'name', op: 'not_empty' })], row({ name: '' }))).toBe(false);
  });
});

describe('number', () => {
  it('compares, ranges inclusively and in either order', () => {
    expect(matches([c({ field: 'kw', op: 'gt', value: '3' })], row({ kw: 5 }))).toBe(true);
    expect(matches([c({ field: 'kw', op: 'between', value: '5', value2: '3' })], row({ kw: 5 }))).toBe(true);
    expect(matches([c({ field: 'kw', op: 'between', value: '3', value2: '5' })], row({ kw: 6 }))).toBe(false);
    expect(matches([c({ field: 'kw', op: 'neq', value: '3' })], row({ kw: null }))).toBe(true);
  });
});

describe('option', () => {
  it('handles is / any of and their null-safe negations', () => {
    expect(matches([c({ field: 'status', op: 'any_of', values: ['new', 'final'] })], row({ status: 'final' }))).toBe(true);
    expect(matches([c({ field: 'status', op: 'is_not', value: 'final' })], row({ status: null }))).toBe(true);
    expect(matches([c({ field: 'status', op: 'none_of', values: ['new'] })], row({ status: 'new' }))).toBe(false);
  });

  it('matches either column of a two-slot field, and negates across both', () => {
    const is = [c({ field: 'assigned', op: 'is', value: 'u1' })];
    expect(matches(is, row({ helper: 'u1' }))).toBe(true);
    expect(matches(is, row({ owner: 'u2' }))).toBe(false);

    const isNot = [c({ field: 'assigned', op: 'is_not', value: 'u1' })];
    expect(matches(isNot, row({ owner: 'u2', helper: 'u1' }))).toBe(false);
    expect(matches(isNot, row({ owner: 'u2' }))).toBe(true);

    expect(matches([c({ field: 'assigned', op: 'empty' })], row({ owner: 'u2' }))).toBe(false);
    expect(matches([c({ field: 'assigned', op: 'not_empty' })], row({ helper: 'u2' }))).toBe(true);
  });
});

describe('dates', () => {
  it('computes calendar windows in local time, weeks from Monday', () => {
    const w = dateWindow('this_week', {}, NOW)!;
    expect(w.from).toEqual(new Date(2026, 9, 12));
    expect(w.before).toEqual(new Date(2026, 9, 19));
    expect(dateWindow('last_month', {}, NOW)).toEqual({ from: new Date(2026, 8, 1), before: new Date(2026, 9, 1) });
    expect(dateWindow('last_n_days', { value: '7' }, NOW)).toEqual({ from: new Date(2026, 9, 9), before: new Date(2026, 9, 16) });
    expect(dateWindow('in_month', { value: '2026-02' }, NOW)).toEqual({ from: new Date(2026, 1, 1), before: new Date(2026, 2, 1) });
  });

  it('matches timestamps against whole local days', () => {
    const at = (h: number, d = 15) => new Date(2026, 9, d, h).toISOString();
    expect(matches([c({ field: 'created_at', op: 'today' })], row({ created_at: at(23) }))).toBe(true);
    expect(matches([c({ field: 'created_at', op: 'today' })], row({ created_at: at(1, 16) }))).toBe(false);
    expect(matches([c({ field: 'created_at', op: 'on', value: '2026-10-14' })], row({ created_at: at(9, 14) }))).toBe(true);
    expect(matches([c({ field: 'created_at', op: 'after', value: '2026-10-14' })], row({ created_at: at(9, 14) }))).toBe(false);
    expect(matches([c({ field: 'created_at', op: 'between', value: '2026-10-01', value2: '2026-10-14' })], row({ created_at: at(22, 14) }))).toBe(true);
    expect(matches([c({ field: 'created_at', op: 'not_on', value: '2026-10-14' })], row({ created_at: null }))).toBe(true);
  });

  it('compares date columns by day string', () => {
    expect(matches([c({ field: 'due', op: 'before', value: '2026-10-15' })], row({ due: '2026-10-14' }))).toBe(true);
    expect(matches([c({ field: 'due', op: 'yesterday' })], row({ due: '2026-10-14' }))).toBe(true);
  });
});

describe('PostgREST', () => {
  it('quotes values inside or() and passes plain filters verbatim', () => {
    const calls: string[] = [];
    const q = {
      filter(col: string, op: string, v: unknown) { calls.push(`filter ${col} ${op} ${v}`); return q; },
      or(s: string, o?: { referencedTable?: string }) { calls.push(`or ${s}${o?.referencedTable ? ` @${o.referencedTable}` : ''}`); return q; },
    };
    const clause = resolveConditions(
      [
        c({ field: 'name', op: 'contains', value: 'a,b' }),
        c({ field: 'status', op: 'is_not', value: 'final' }),
        c({ field: 'status', op: 'any_of', values: ['new', 'final'] }),
      ],
      fields,
      NOW
    );
    applyClause(q, clause);
    expect(calls).toEqual([
      'filter name ilike %a,b%',
      'or status.neq."final",status.is.null',
      'filter status in ("new","final")',
    ]);
  });

  it('scopes an embedded group to its table', () => {
    expect(toPostgrestOr([{ column: 'leads.district', op: 'eq', value: 'Kota' }, { column: 'leads.district', op: 'null' }]))
      .toBe('district.eq."Kota",district.is.null');
  });
});

describe('operator limits', () => {
  it('offers and accepts only the operators a field allows', () => {
    const limited: FilterField<Row>[] = [{ key: 'status', label: 'Status', type: 'option', operators: ['is'] }];
    expect(operatorsFor(limited[0]).map((o) => o.op)).toEqual(['is']);
    expect(isComplete(c({ field: 'status', op: 'is', value: 'new' }), limited)).toBe(true);
    expect(isComplete(c({ field: 'status', op: 'is_not', value: 'new' }), limited)).toBe(false);
  });
});

describe('distinctValues', () => {
  it('returns sorted, unique, non-blank raw values', () => {
    const rows = [{ d: 'Kota' }, { d: 'Bundi' }, { d: 'Kota' }, { d: '  ' }, { d: null }, { d: 'Kota ' }];
    expect(distinctValues(rows, (r) => r.d)).toEqual(['Bundi', 'Kota', 'Kota ']);
  });

  it('collapses case variants, since "is" ignores case', () => {
    expect(distinctValues([{ d: 'kota' }, { d: 'Kota' }], (r) => r.d)).toHaveLength(1);
  });
});
