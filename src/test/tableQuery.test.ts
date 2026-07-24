import { describe, it, expect } from 'vitest';
import { buildSearchFilter, toTablePage, defaultSort } from '@/lib/tableQuery';

describe('buildSearchFilter', () => {
  it('builds an ilike clause per column', () => {
    expect(buildSearchFilter('ramesh', ['full_name', 'email'])).toBe(
      'full_name.ilike.%ramesh%,email.ilike.%ramesh%'
    );
  });

  it('returns null for blank input so the caller skips the filter', () => {
    expect(buildSearchFilter('', ['name'])).toBeNull();
    expect(buildSearchFilter('   ', ['name'])).toBeNull();
  });

  it('returns null when no columns are searchable', () => {
    expect(buildSearchFilter('ramesh', [])).toBeNull();
  });

  // PostgREST's or() grammar uses commas and parentheses as delimiters and has
  // no escape sequence, so a term containing them would otherwise be parsed as
  // extra filter conditions.
  it('strips characters that would break out of the filter expression', () => {
    const result = buildSearchFilter('a,b', ['name']);
    expect(result).toBe('name.ilike.%a b%');
    // One clause only — the comma did not create a second condition.
    expect(result!.split('.ilike.').length - 1).toBe(1);
  });

  it('strips parentheses and wildcards', () => {
    expect(buildSearchFilter('x(y)z', ['name'])).toBe('name.ilike.%x y z%');
    expect(buildSearchFilter('a*b', ['name'])).toBe('name.ilike.%a b%');
  });

  it('trims surrounding whitespace', () => {
    expect(buildSearchFilter('  ramesh  ', ['name'])).toBe('name.ilike.%ramesh%');
  });
});

describe('toTablePage', () => {
  it('returns rows and the server-side total', () => {
    const page = toTablePage({ data: [{ id: '1' }], error: null, count: 87 });
    expect(page.rows).toHaveLength(1);
    expect(page.total).toBe(87);
  });

  it('treats a null result as empty rather than throwing', () => {
    expect(toTablePage({ data: null, error: null, count: 0 })).toEqual({ rows: [], total: 0 });
  });

  // Several existing pages drop the error and render "no records", making a
  // failed fetch indistinguishable from genuinely empty data.
  it('throws on error instead of reporting an empty page', () => {
    expect(() => toTablePage({ data: null, error: { message: 'RLS denied' }, count: null })).toThrow(
      'RLS denied'
    );
  });
});

describe('defaultSort', () => {
  it('defaults to descending', () => {
    expect(defaultSort('created_at')).toEqual({ column: 'created_at', direction: 'desc' });
  });

  it('accepts an explicit direction', () => {
    expect(defaultSort('full_name', 'asc')).toEqual({ column: 'full_name', direction: 'asc' });
  });
});
