/**
 * Payment schedules.
 *
 * Cash:  30% advance → 60% after installation → 10% after commissioning.
 * Loan:  customer margin (project cost minus sanctioned loan) → bank's first
 *        installment → bank's final installment after commissioning.
 *
 * Fabrication on a loan file is blocked until `loan_bank_first` is received —
 * enforced in `can_advance_project`, mirrored here for the UI.
 */

export type PaymentMilestone =
  | 'cash_advance_30'
  | 'cash_post_installation_60'
  | 'cash_commissioning_10'
  | 'loan_customer_margin'
  | 'loan_bank_first'
  | 'loan_bank_final'
  | 'other';

export type PaymentSource = 'customer' | 'bank';

export interface MilestoneDefinition {
  milestone: PaymentMilestone;
  label: string;
  /** Who pays this one. */
  source: PaymentSource;
  /** Share of the project value; null when the amount isn't a fixed fraction. */
  share: number | null;
  /** When it falls due, in plain language. */
  dueWhen: string;
}

export const CASH_SCHEDULE: MilestoneDefinition[] = [
  {
    milestone: 'cash_advance_30',
    label: 'Advance (30%)',
    source: 'customer',
    share: 0.3,
    dueWhen: 'On booking, before material is ordered',
  },
  {
    milestone: 'cash_post_installation_60',
    label: 'After Installation (60%)',
    source: 'customer',
    share: 0.6,
    dueWhen: 'Once installation is completed',
  },
  {
    milestone: 'cash_commissioning_10',
    label: 'After Commissioning (10%)',
    source: 'customer',
    share: 0.1,
    dueWhen: 'Once the plant is commissioned',
  },
];

export const LOAN_SCHEDULE: MilestoneDefinition[] = [
  {
    milestone: 'loan_customer_margin',
    label: 'Customer Margin',
    source: 'customer',
    // Project cost minus the sanctioned loan — not a fixed fraction.
    share: null,
    dueWhen: 'On booking — the difference between project cost and sanctioned loan',
  },
  {
    milestone: 'loan_bank_first',
    label: 'Bank — First Installment',
    source: 'bank',
    share: null,
    dueWhen: 'Before fabrication starts. Installation is blocked until this is received.',
  },
  {
    milestone: 'loan_bank_final',
    label: 'Bank — Final Installment',
    source: 'bank',
    share: null,
    dueWhen: 'After the plant is commissioned',
  },
];

export const scheduleFor = (paymentType: string | null | undefined): MilestoneDefinition[] =>
  paymentType === 'loan' ? LOAN_SCHEDULE : CASH_SCHEDULE;

export const milestoneLabels: Record<PaymentMilestone, string> = {
  ...Object.fromEntries(
    [...CASH_SCHEDULE, ...LOAN_SCHEDULE].map((m) => [m.milestone, m.label])
  ),
  other: 'Other',
} as Record<PaymentMilestone, string>;

export interface ScheduleLine extends MilestoneDefinition {
  /** Expected amount, or null when it depends on the loan sanction. */
  expected: number | null;
  received: number;
  isSettled: boolean;
}

export interface PaymentLike {
  amount: number;
  status: string;
  milestone: string | null;
}

/**
 * Builds the schedule for a project with each milestone's expected and
 * received amounts.
 *
 * Only `completed` payments count as received — a pending record is a claim,
 * not money in the bank, and the loan gate must not open on one.
 */
export const buildSchedule = (
  paymentType: string | null | undefined,
  finalAmount: number,
  payments: PaymentLike[],
  /** Sanctioned loan amount, used to derive the customer margin. */
  loanAmount?: number | null
): ScheduleLine[] => {
  const schedule = scheduleFor(paymentType);

  return schedule.map((definition) => {
    const received = payments
      .filter((p) => p.milestone === definition.milestone && p.status === 'completed')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    let expected: number | null = null;
    if (definition.share !== null) {
      expected = Math.round(finalAmount * definition.share);
    } else if (definition.milestone === 'loan_customer_margin' && loanAmount != null) {
      expected = Math.max(0, Math.round(finalAmount - loanAmount));
    }

    return {
      ...definition,
      expected,
      received,
      // With no expected amount, any receipt settles the line — the bank
      // decides its own installment split.
      isSettled: expected !== null ? received >= expected : received > 0,
    };
  });
};

export interface PaymentTotals {
  totalDue: number;
  received: number;
  pending: number;
  balance: number;
  overpaidBy: number;
  fullyPaid: boolean;
}

export const summarisePayments = (
  finalAmount: number,
  payments: PaymentLike[]
): PaymentTotals => {
  const received = payments
    .filter((p) => p.status === 'completed')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const pending = payments
    .filter((p) => p.status === 'pending')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return {
    totalDue: finalAmount,
    received,
    pending,
    // Clamped: an overpayment must not display as a negative balance, which is
    // what the existing dialog does today.
    balance: Math.max(finalAmount - received, 0),
    overpaidBy: Math.max(received - finalAmount, 0),
    fullyPaid: finalAmount > 0 && received >= finalAmount,
  };
};

/** True when a loan project may begin fabrication. */
export const canStartFabrication = (
  paymentType: string | null | undefined,
  payments: PaymentLike[]
): boolean => {
  if (paymentType !== 'loan') return true;
  return payments.some(
    (p) => p.milestone === 'loan_bank_first' && p.status === 'completed'
  );
};

export const formatMoney = (value: number | null | undefined): string =>
  `₹${Number(value ?? 0).toLocaleString('en-IN')}`;
