import { describe, it, expect } from 'vitest';
import { calculateSubsidy, formatSubsidy, SUBSIDY_SLABS_FALLBACK } from '@/lib/subsidy';

describe('calculateSubsidy', () => {
  it('pays nothing below the 1 kW threshold', () => {
    expect(calculateSubsidy(0)).toBe(0);
    expect(calculateSubsidy(0.5)).toBe(0);
    expect(calculateSubsidy(0.99)).toBe(0);
  });

  it('applies the PM Surya Ghar slabs by capacity', () => {
    expect(calculateSubsidy(1)).toBe(30000);
    expect(calculateSubsidy(1.5)).toBe(60000);
    expect(calculateSubsidy(2)).toBe(60000);
    expect(calculateSubsidy(3)).toBe(78000);
    expect(calculateSubsidy(10)).toBe(78000);
  });

  it('treats slab bounds as inclusive upper limits', () => {
    expect(calculateSubsidy(1)).toBe(30000);
    expect(calculateSubsidy(1.01)).toBe(60000);
    expect(calculateSubsidy(2)).toBe(60000);
    expect(calculateSubsidy(2.01)).toBe(78000);
  });

  // This is the bug the slab table replaced: every capacity used to return
  // 78000, over-quoting the subsidy for every system under 3 kW.
  it('no longer returns the flat 78000 for small systems', () => {
    expect(calculateSubsidy(1)).not.toBe(78000);
    expect(calculateSubsidy(2)).not.toBe(78000);
  });

  it('accepts numeric strings, as the capacity form fields supply', () => {
    expect(calculateSubsidy('2')).toBe(60000);
    expect(calculateSubsidy('3.5')).toBe(78000);
  });

  it('returns 0 for missing or unparseable capacity rather than guessing', () => {
    expect(calculateSubsidy(null)).toBe(0);
    expect(calculateSubsidy(undefined)).toBe(0);
    expect(calculateSubsidy('')).toBe(0);
    expect(calculateSubsidy('abc')).toBe(0);
    expect(calculateSubsidy(NaN)).toBe(0);
    expect(calculateSubsidy(-5)).toBe(0);
  });

  it('honours custom slabs from system_configs', () => {
    const slabs = [
      { max_kw: 3, amount: 50000 },
      { max_kw: null, amount: 90000 },
    ];
    expect(calculateSubsidy(2, slabs)).toBe(50000);
    expect(calculateSubsidy(5, slabs)).toBe(90000);
  });

  it('ships a fallback table ending in an open-ended slab', () => {
    const last = SUBSIDY_SLABS_FALLBACK[SUBSIDY_SLABS_FALLBACK.length - 1];
    expect(last.max_kw).toBeNull();
  });
});

describe('formatSubsidy', () => {
  it('formats in the Indian numbering system', () => {
    expect(formatSubsidy(78000)).toBe('₹78,000');
    expect(formatSubsidy(30000)).toBe('₹30,000');
    expect(formatSubsidy(0)).toBe('₹0');
  });
});
