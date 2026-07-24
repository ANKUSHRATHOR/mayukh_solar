import { describe, it, expect } from 'vitest';
import {
  buildSchedule,
  canStartFabrication,
  summarisePayments,
  scheduleFor,
  CASH_SCHEDULE,
  LOAN_SCHEDULE,
  type PaymentLike,
} from '@/lib/payments';

const paid = (amount: number, milestone: string): PaymentLike => ({
  amount,
  milestone,
  status: 'completed',
});
const unpaid = (amount: number, milestone: string): PaymentLike => ({
  amount,
  milestone,
  status: 'pending',
});

describe('schedule selection', () => {
  it('uses the cash schedule by default', () => {
    expect(scheduleFor('cash')).toBe(CASH_SCHEDULE);
    expect(scheduleFor(null)).toBe(CASH_SCHEDULE);
    expect(scheduleFor(undefined)).toBe(CASH_SCHEDULE);
  });

  it('uses the loan schedule for loan projects', () => {
    expect(scheduleFor('loan')).toBe(LOAN_SCHEDULE);
  });

  it('cash shares add up to the whole project value', () => {
    const total = CASH_SCHEDULE.reduce((sum, m) => sum + (m.share ?? 0), 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('buildSchedule — cash', () => {
  const finalAmount = 200000;

  it('splits the value 30 / 60 / 10', () => {
    const lines = buildSchedule('cash', finalAmount, []);
    expect(lines.map((l) => l.expected)).toEqual([60000, 120000, 20000]);
  });

  it('expected amounts sum to the project value', () => {
    const lines = buildSchedule('cash', finalAmount, []);
    expect(lines.reduce((sum, l) => sum + (l.expected ?? 0), 0)).toBe(finalAmount);
  });

  it('credits a milestone once its full amount is received', () => {
    const lines = buildSchedule('cash', finalAmount, [paid(60000, 'cash_advance_30')]);
    expect(lines[0].received).toBe(60000);
    expect(lines[0].isSettled).toBe(true);
    expect(lines[1].isSettled).toBe(false);
  });

  it('does not settle a milestone on a partial payment', () => {
    const lines = buildSchedule('cash', finalAmount, [paid(30000, 'cash_advance_30')]);
    expect(lines[0].received).toBe(30000);
    expect(lines[0].isSettled).toBe(false);
  });

  // A pending record is a claim, not money received.
  it('ignores pending payments', () => {
    const lines = buildSchedule('cash', finalAmount, [unpaid(60000, 'cash_advance_30')]);
    expect(lines[0].received).toBe(0);
    expect(lines[0].isSettled).toBe(false);
  });

  it('sums multiple part-payments against one milestone', () => {
    const lines = buildSchedule('cash', finalAmount, [
      paid(20000, 'cash_advance_30'),
      paid(40000, 'cash_advance_30'),
    ]);
    expect(lines[0].received).toBe(60000);
    expect(lines[0].isSettled).toBe(true);
  });
});

describe('buildSchedule — loan', () => {
  const finalAmount = 300000;
  const loanAmount = 240000;

  it('derives the customer margin from cost minus sanctioned loan', () => {
    const lines = buildSchedule('loan', finalAmount, [], loanAmount);
    expect(lines[0].milestone).toBe('loan_customer_margin');
    expect(lines[0].expected).toBe(60000);
  });

  it('never shows a negative margin when the loan covers the whole cost', () => {
    const lines = buildSchedule('loan', finalAmount, [], 350000);
    expect(lines[0].expected).toBe(0);
  });

  it('leaves bank installments open-ended — the bank sets its own split', () => {
    const lines = buildSchedule('loan', finalAmount, [], loanAmount);
    expect(lines[1].expected).toBeNull();
    expect(lines[2].expected).toBeNull();
  });

  it('settles an open-ended milestone on any receipt', () => {
    const lines = buildSchedule('loan', finalAmount, [paid(100000, 'loan_bank_first')], loanAmount);
    expect(lines[1].isSettled).toBe(true);
  });

  it('cannot derive the margin without a sanctioned amount', () => {
    const lines = buildSchedule('loan', finalAmount, []);
    expect(lines[0].expected).toBeNull();
  });
});

describe('canStartFabrication', () => {
  it('always allows cash projects', () => {
    expect(canStartFabrication('cash', [])).toBe(true);
    expect(canStartFabrication(null, [])).toBe(true);
  });

  // The gate the business owner asked for: no fabrication on a loan file until
  // the bank's first installment is actually in.
  it('blocks a loan project until the bank first installment is received', () => {
    expect(canStartFabrication('loan', [])).toBe(false);
    expect(canStartFabrication('loan', [paid(50000, 'loan_customer_margin')])).toBe(false);
  });

  it('does not open the gate on a merely pending bank installment', () => {
    expect(canStartFabrication('loan', [unpaid(100000, 'loan_bank_first')])).toBe(false);
  });

  it('opens once the bank first installment is completed', () => {
    expect(canStartFabrication('loan', [paid(100000, 'loan_bank_first')])).toBe(true);
  });
});

describe('summarisePayments', () => {
  it('separates received from pending', () => {
    const totals = summarisePayments(200000, [
      paid(60000, 'cash_advance_30'),
      unpaid(120000, 'cash_post_installation_60'),
    ]);
    expect(totals.received).toBe(60000);
    expect(totals.pending).toBe(120000);
    expect(totals.balance).toBe(140000);
    expect(totals.fullyPaid).toBe(false);
  });

  it('marks fully paid when the balance clears', () => {
    const totals = summarisePayments(200000, [
      paid(60000, 'cash_advance_30'),
      paid(140000, 'cash_post_installation_60'),
    ]);
    expect(totals.balance).toBe(0);
    expect(totals.fullyPaid).toBe(true);
  });

  // The existing dialog renders a negative balance in green, as if settled.
  it('reports an overpayment separately instead of a negative balance', () => {
    const totals = summarisePayments(200000, [paid(250000, 'cash_advance_30')]);
    expect(totals.balance).toBe(0);
    expect(totals.overpaidBy).toBe(50000);
    expect(totals.fullyPaid).toBe(true);
  });

  it('is not fully paid when nothing is owed and nothing received', () => {
    expect(summarisePayments(0, []).fullyPaid).toBe(false);
  });
});
