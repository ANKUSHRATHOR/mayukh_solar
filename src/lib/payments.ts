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

/**
 * Does this project involve bank money?
 *
 * `loan_cash` is part customer cash, part bank loan. Every gate that used to ask
 * `paymentType === 'loan'` was really asking this, and treating anything else as
 * cash — which would have waved a loan_cash project straight past the bank gate.
 * Ask this instead, never the equality.
 */
export const involvesLoan = (paymentType: string | null | undefined): boolean =>
  paymentType === 'loan' || paymentType === 'loan_cash';

export const paymentTypeLabels: Record<string, string> = {
  cash: 'Cash',
  loan: 'Loan',
  loan_cash: 'Loan + Cash',
};

export const paymentTypeLabel = (paymentType: string | null | undefined): string =>
  paymentTypeLabels[paymentType ?? ''] ?? 'Cash';

/**
 * A loan_cash project follows the loan schedule: the customer's share is the
 * margin, and the bank still pays in two instalments. The difference from a pure
 * loan is how much margin the customer carries, which the schedule already
 * derives from the sanctioned amount rather than assuming a fraction.
 */
export const scheduleFor = (paymentType: string | null | undefined): MilestoneDefinition[] =>
  involvesLoan(paymentType) ? LOAN_SCHEDULE : CASH_SCHEDULE;

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
  if (!involvesLoan(paymentType)) return true;
  return payments.some(
    (p) => p.milestone === 'loan_bank_first' && p.status === 'completed'
  );
};

export const formatMoney = (value: number | null | undefined): string =>
  `₹${Number(value ?? 0).toLocaleString('en-IN')}`;

// ---------------------------------------------------------------------------
// Collection window
// ---------------------------------------------------------------------------

/**
 * When a customer's money is due.
 *
 * The clock starts when the plant goes live — the `net_meter_installed` stage —
 * and the customer has `dueDays` (admin-configurable, 2 by default) to settle
 * the balance.
 *
 * It deliberately does NOT start at `project_completed`: `can_advance_project`
 * refuses that stage unless the project is already fully paid, so a completed
 * project with an outstanding balance cannot exist and the dues list anchored
 * there would always be empty.
 */
export type DueStatus = 'not_applicable' | 'upcoming' | 'due_today' | 'overdue';

export const DEFAULT_PAYMENT_DUE_DAYS = 2;

export interface DueStatusInput {
  /** When the project reached `net_meter_installed`. Null before it does. */
  netMeterInstalledAt: string | Date | null | undefined;
  /** Outstanding amount. Nothing is chased once this reaches zero. */
  balance: number;
  dueDays?: number;
  /** Injectable for tests. */
  now?: Date;
}

/**
 * The business runs on Asia/Kolkata, and `project_dues` compares calendar dates
 * in that zone. Comparing UTC instants instead would put anything stamped after
 * 18:30 IST on the previous day and make the boundary off by one.
 */
const istDateKey = (value: Date): string =>
  value.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const wholeDaysBetween = (from: Date, to: Date): number => {
  const [fy, fm, fd] = istDateKey(from).split('-').map(Number);
  const [ty, tm, td] = istDateKey(to).split('-').map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000
  );
};

export const dueStatusFor = ({
  netMeterInstalledAt,
  balance,
  dueDays = DEFAULT_PAYMENT_DUE_DAYS,
  now = new Date(),
}: DueStatusInput): { status: DueStatus; daysOverdue: number; daysElapsed: number } => {
  const idle = { status: 'not_applicable' as const, daysOverdue: 0, daysElapsed: 0 };

  if (balance <= 0 || !netMeterInstalledAt) return idle;

  const start = netMeterInstalledAt instanceof Date
    ? netMeterInstalledAt
    : new Date(netMeterInstalledAt);
  if (Number.isNaN(start.getTime())) return idle;

  const daysElapsed = wholeDaysBetween(start, now);
  const daysOverdue = daysElapsed - dueDays;

  // Strictly greater: on the last day of the window the money is due today, not
  // yet late. Mirrors the `>` in project_dues.is_overdue.
  const status: DueStatus =
    daysOverdue > 0 ? 'overdue' : daysOverdue === 0 ? 'due_today' : 'upcoming';

  return { status, daysOverdue: Math.max(daysOverdue, 0), daysElapsed };
};

export const dueStatusLabels: Record<DueStatus, string> = {
  not_applicable: 'Nothing outstanding',
  upcoming: 'Payment window open',
  due_today: 'Due today',
  overdue: 'Overdue',
};

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

/**
 * Where a payment sits.
 *
 * `unallocated` is an inbox, not a resting place — money logged before anyone
 * knew which project it belonged to. `general` is the deliberate opt-out for
 * income that will never have a project, so it stops appearing in the inbox.
 */
export type Allocation = 'linked' | 'unallocated' | 'general';

export const allocationOf = (payment: {
  project_id?: string | null;
  no_project_needed?: boolean | null;
}): Allocation => {
  if (payment.project_id) return 'linked';
  return payment.no_project_needed ? 'general' : 'unallocated';
};

export const allocationLabels: Record<Allocation, string> = {
  linked: 'Linked to project',
  unallocated: 'Unallocated',
  general: 'General income',
};

export const paymentModeLabels: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  cheque: 'Cheque',
  upi: 'UPI',
  other: 'Other',
};
