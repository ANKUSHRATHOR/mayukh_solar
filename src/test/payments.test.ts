import { describe, it, expect } from 'vitest';
import {
  buildSchedule,
  canStartFabrication,
  summarisePayments,
  scheduleFor,
  involvesLoan,
  paymentTypeLabel,
  dueStatusFor,
  allocationOf,
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

describe('dueStatusFor', () => {
  // IST noon, so the calendar-date arithmetic can't be nudged over a boundary
  // by the UTC offset.
  const at = (iso: string) => new Date(`${iso}T12:00:00+05:30`);

  it('is not applicable before the plant goes live', () => {
    expect(
      dueStatusFor({ netMeterInstalledAt: null, balance: 100000, now: at('2026-09-07') }).status
    ).toBe('not_applicable');
  });

  it('is not applicable once the balance is settled', () => {
    expect(
      dueStatusFor({
        netMeterInstalledAt: at('2026-08-01'),
        balance: 0,
        now: at('2026-09-07'),
      }).status
    ).toBe('not_applicable');
  });

  it('is upcoming inside the window', () => {
    const result = dueStatusFor({
      netMeterInstalledAt: at('2026-09-06'),
      balance: 50000,
      now: at('2026-09-07'),
    });
    expect(result.status).toBe('upcoming');
    expect(result.daysOverdue).toBe(0);
  });

  // The boundary the SQL `>` and this `> 0` have to agree on: on day 2 of a
  // 2-day window the money is due, not yet late.
  it('is due today on the last day of the window', () => {
    expect(
      dueStatusFor({
        netMeterInstalledAt: at('2026-09-05'),
        balance: 50000,
        now: at('2026-09-07'),
      }).status
    ).toBe('due_today');
  });

  it('is overdue the day after the window closes', () => {
    const result = dueStatusFor({
      netMeterInstalledAt: at('2026-09-04'),
      balance: 50000,
      now: at('2026-09-07'),
    });
    expect(result.status).toBe('overdue');
    expect(result.daysOverdue).toBe(1);
  });

  it('honours a custom window', () => {
    const input = {
      netMeterInstalledAt: at('2026-09-04'),
      balance: 50000,
      now: at('2026-09-07'),
    };
    expect(dueStatusFor({ ...input, dueDays: 7 }).status).toBe('upcoming');
    expect(dueStatusFor({ ...input, dueDays: 0 }).daysOverdue).toBe(3);
  });

  it('treats an unparseable timestamp as no timestamp', () => {
    expect(
      dueStatusFor({ netMeterInstalledAt: 'not a date', balance: 50000 }).status
    ).toBe('not_applicable');
  });
});

describe('allocationOf', () => {
  it('files a payment with a project as linked', () => {
    expect(allocationOf({ project_id: 'abc', no_project_needed: false })).toBe('linked');
  });

  it('files an unlinked payment into the inbox', () => {
    expect(allocationOf({ project_id: null, no_project_needed: false })).toBe('unallocated');
  });

  it('keeps deliberate general income out of the inbox', () => {
    expect(allocationOf({ project_id: null, no_project_needed: true })).toBe('general');
  });
});


describe('loan_cash', () => {
  // Part customer cash, part bank loan. Every gate used to ask
  // `paymentType === 'loan'` and treat anything else as cash, which would have
  // waved a loan_cash project straight past the bank gate.
  it('counts as involving a loan', () => {
    expect(involvesLoan('loan_cash')).toBe(true);
    expect(involvesLoan('loan')).toBe(true);
    expect(involvesLoan('cash')).toBe(false);
    expect(involvesLoan(null)).toBe(false);
    expect(involvesLoan(undefined)).toBe(false);
  });

  it('follows the loan schedule, not the cash one', () => {
    expect(scheduleFor('loan_cash')).toBe(LOAN_SCHEDULE);
    expect(scheduleFor('loan')).toBe(LOAN_SCHEDULE);
    expect(scheduleFor('cash')).toBe(CASH_SCHEDULE);
  });

  // The whole point of the enum value: this gate must not open early.
  it('blocks fabrication until the bank first instalment lands', () => {
    expect(canStartFabrication('loan_cash', [])).toBe(false);
    expect(
      canStartFabrication('loan_cash', [
        { amount: 100000, status: 'completed', milestone: 'loan_bank_first' },
      ])
    ).toBe(true);
    // A pending claim is not money in the bank.
    expect(
      canStartFabrication('loan_cash', [
        { amount: 100000, status: 'pending', milestone: 'loan_bank_first' },
      ])
    ).toBe(false);
    // Cash is never blocked.
    expect(canStartFabrication('cash', [])).toBe(true);
  });

  it('is labelled distinctly from a plain loan', () => {
    expect(paymentTypeLabel('loan_cash')).toBe('Loan + Cash');
    expect(paymentTypeLabel('loan')).toBe('Loan');
    expect(paymentTypeLabel('cash')).toBe('Cash');
    expect(paymentTypeLabel(null)).toBe('Cash');
  });
});
