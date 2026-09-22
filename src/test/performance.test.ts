import { describe, it, expect } from 'vitest';
import {
  addDays,
  businessDate,
  daysBetween,
  delta,
  formatRate,
  isOverdue,
  periodRange,
  rate,
  reconciles,
  targetMetricForRole,
  workStatusMeta,
} from '@/lib/performance';

describe('business day', () => {
  it('reads the date in the office timezone, not the browser one', () => {
    // 22:00 UTC on 17 Sep is already the 18th in India. A UTC boundary would
    // file a morning's work under the previous day on the Today tile.
    expect(businessDate(new Date('2026-09-17T22:00:00Z'))).toBe('2026-09-18');
    expect(businessDate(new Date('2026-09-17T18:29:00Z'))).toBe('2026-09-17');
    expect(businessDate(new Date('2026-09-17T18:31:00Z'))).toBe('2026-09-18');
  });
});

describe('calendar helpers', () => {
  it('counts both ends of a range', () => {
    expect(daysBetween('2026-09-01', '2026-09-01')).toBe(1);
    expect(daysBetween('2026-09-01', '2026-09-30')).toBe(30);
  });

  it('shifts across month and year boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });
});

describe('periodRange', () => {
  const now = new Date('2026-09-18T06:00:00Z'); // 11:30 IST on the 18th

  it('today is one business day, compared against yesterday', () => {
    const r = periodRange('today', undefined, now);
    expect(r).toMatchObject({ from: '2026-09-18', to: '2026-09-18', grain: 'day' });
    expect(r.previous).toMatchObject({ from: '2026-09-17', to: '2026-09-17' });
  });

  it('this month runs to today and compares against the same days of last month', () => {
    const r = periodRange('month', undefined, now);
    expect(r).toMatchObject({ from: '2026-09-01', to: '2026-09-18' });
    // 18 days against 18 days — not 18 against 31, which would report a
    // collapse in every month.
    expect(r.previous).toMatchObject({ from: '2026-08-01', to: '2026-08-18' });
  });

  it('clamps the comparison day when the previous month is shorter', () => {
    const march31 = new Date('2026-03-31T06:00:00Z');
    expect(periodRange('month', undefined, march31).previous).toMatchObject({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('this year is year-to-date against the same slice of last year', () => {
    const r = periodRange('year', undefined, now);
    expect(r).toMatchObject({ from: '2026-01-01', to: '2026-09-18', grain: 'month' });
    expect(r.previous).toMatchObject({ from: '2025-01-01', to: '2025-09-18' });
  });

  it('a custom range compares against the equally long span before it', () => {
    const r = periodRange('custom', { from: '2026-09-10', to: '2026-09-19' }, now);
    expect(r.previous).toMatchObject({ from: '2026-08-31', to: '2026-09-09' });
    expect(r.grain).toBe('day');
  });

  it('switches a long custom range to month buckets', () => {
    expect(periodRange('custom', { from: '2026-01-01', to: '2026-09-18' }, now).grain).toBe('month');
  });
});

describe('rate', () => {
  it('is null, never zero, when there is nothing to divide by', () => {
    // "0%" is a claim about performance. No denominator supports it.
    expect(rate(0, 0)).toBeNull();
    expect(rate(5, 0)).toBeNull();
    expect(rate(1, -3)).toBeNull();
    expect(formatRate(rate(0, 0))).toBe('No data');
  });

  it('computes to one decimal place', () => {
    expect(rate(1, 3)).toBe(33.3);
    expect(rate(1, 2)).toBe(50);
    expect(formatRate(rate(1, 2))).toBe('50%');
    expect(formatRate(rate(1, 3))).toBe('33.3%');
  });

  it('genuinely zero completions against real assigned work is 0%, not "No data"', () => {
    expect(rate(0, 12)).toBe(0);
    expect(formatRate(rate(0, 12))).toBe('0%');
  });
});

describe('delta', () => {
  it('refuses a percentage when the previous period had nothing', () => {
    expect(delta(10, 0)).toEqual({ value: null, direction: 'unknown' });
  });

  it('reports direction and size against a real baseline', () => {
    expect(delta(12, 10)).toEqual({ value: 20, direction: 'up' });
    expect(delta(8, 10)).toEqual({ value: -20, direction: 'down' });
    expect(delta(10, 10)).toEqual({ value: 0, direction: 'flat' });
  });
});

describe('isOverdue', () => {
  const today = '2026-09-18';

  it('is a past due date on open work', () => {
    expect(isOverdue({ due_date: '2026-09-17', status: 'in_progress' }, today)).toBe(true);
    expect(isOverdue({ due_date: '2026-09-17', status: 'not_started' }, today)).toBe(true);
  });

  it('is never true for finished or cancelled work', () => {
    expect(isOverdue({ due_date: '2026-09-01', status: 'completed' }, today)).toBe(false);
    expect(isOverdue({ due_date: '2026-09-01', status: 'cancelled' }, today)).toBe(false);
  });

  it('due today is not yet late, and no due date is never late', () => {
    expect(isOverdue({ due_date: today, status: 'in_progress' }, today)).toBe(false);
    expect(isOverdue({ due_date: null, status: 'not_started' }, today)).toBe(false);
  });
});

describe('the status vocabulary', () => {
  it('keeps overdue out of the stored statuses and gives each one a label', () => {
    expect(Object.keys(workStatusMeta)).toEqual([
      'not_started',
      'in_progress',
      'completed',
      'cancelled',
      'overdue',
    ]);
    // Colour is never the only signal: each status carries a written label.
    for (const meta of Object.values(workStatusMeta)) {
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });
});

describe('reconciliation', () => {
  it('holds when the four outcomes account for everything assigned', () => {
    expect(
      reconciles({
        work_assigned: 10,
        work_completed: 4,
        work_pending: 3,
        work_overdue: 2,
        work_cancelled: 1,
      })
    ).toBe(true);
  });

  it('fails when a count is double-attributed', () => {
    expect(
      reconciles({
        work_assigned: 10,
        work_completed: 4,
        work_pending: 4,
        work_overdue: 2,
        work_cancelled: 1,
      })
    ).toBe(false);
  });
});

describe('target metric per role', () => {
  it('keeps target and achievement in the same unit', () => {
    expect(targetMetricForRole('sales_person')).toBe('revenue');
    expect(targetMetricForRole('telecaller')).toBe('connected_calls');
    expect(targetMetricForRole('operator')).toBe('projects_completed');
    expect(targetMetricForRole('welder')).toBe('projects_completed');
  });
});
