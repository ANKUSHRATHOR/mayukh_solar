import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import SectionCard from '@/components/common/SectionCard';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchSystemConfig } from '@/lib/systemConfig';
import {
  DEFAULT_PAYMENT_DUE_DAYS,
  dueStatusFor,
  formatMoney,
  paymentModeLabels,
  summarisePayments,
} from '@/lib/payments';
import {
  deletePayment,
  fetchProjectPayments,
  type PaymentRow,
} from '@/lib/paymentsData';
import PaymentFormDialog from '@/components/payments/PaymentFormDialog';

interface Props {
  projectId: string;
  finalAmount: number;
  paymentType: 'cash' | 'loan';
  /** How the project is labelled to users — K-Number, then name, then mobile. */
  projectLabel: string;
  /** When the plant went live. Null until the project reaches net_meter_installed. */
  netMeterInstalledAt: string | null;
  /** Called after any write, so the parent can refresh stage requirements. */
  onChanged?: () => void;
}

/**
 * A project's money: what it is worth, what has come in, what is still owed,
 * and how long the customer has had to settle up.
 *
 * Replaces the arithmetic ManagePaymentsDialog did inline, which subtracted
 * without clamping and rendered an overpayment as a negative balance.
 */
const ProjectPaymentsPanel = ({
  projectId,
  finalAmount,
  paymentType,
  projectLabel,
  netMeterInstalledAt,
  onChanged,
}: Props) => {
  const { toast } = useToast();
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const paymentsQuery = useQuery({
    queryKey: ['payments', 'project', projectId],
    queryFn: () => fetchProjectPayments(projectId),
  });

  const dueDaysQuery = useQuery({
    queryKey: ['config', 'payment_due_days'],
    queryFn: () => fetchSystemConfig<number>('payment_due_days'),
    staleTime: 5 * 60 * 1000,
  });
  const dueDays = Number(dueDaysQuery.data ?? DEFAULT_PAYMENT_DUE_DAYS);

  const payments = useMemo(() => paymentsQuery.data ?? [], [paymentsQuery.data]);
  const totals = useMemo(
    () => summarisePayments(finalAmount, payments),
    [finalAmount, payments]
  );
  const due = dueStatusFor({
    netMeterInstalledAt,
    balance: totals.balance,
    dueDays,
  });

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (payment: PaymentRow) => {
    setEditing(payment);
    setFormOpen(true);
  };

  const handleDelete = async (payment: PaymentRow) => {
    if (
      !window.confirm(
        `Delete this ${formatMoney(payment.amount)} payment? This cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingId(payment.id);
    try {
      await deletePayment(payment.id, payment);
      toast({ title: 'Payment deleted' });
      paymentsQuery.refetch();
      onChanged?.();
    } catch (error) {
      toast({
        title: 'Could not delete the payment',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const afterSave = () => {
    paymentsQuery.refetch();
    onChanged?.();
  };

  if (paymentsQuery.error) {
    return <ErrorState error={paymentsQuery.error as Error} onRetry={() => paymentsQuery.refetch()} />;
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Money"
        icon={Wallet}
        actions={
          <Button size="sm" className="h-11 gap-1.5 text-xs font-semibold sm:h-8" onClick={openNew}>
            <Plus className="h-3.5 w-3.5" /> Add payment
          </Button>
        }
      >
        <div className="grid grid-cols-3 gap-3">
          <Figure label="Total cost" value={formatMoney(totals.totalDue)} />
          <Figure label="Received" value={formatMoney(totals.received)} tone="success" />
          <Figure
            label={totals.overpaidBy > 0 ? 'Overpaid' : 'Outstanding'}
            value={formatMoney(totals.overpaidBy > 0 ? totals.overpaidBy : totals.balance)}
            tone={totals.overpaidBy > 0 ? 'info' : totals.balance > 0 ? 'warning' : 'success'}
          />
        </div>

        {totals.pending > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {formatMoney(totals.pending)} recorded as pending — not counted as received.
          </p>
        )}

        <DueBanner
          status={due.status}
          daysOverdue={due.daysOverdue}
          dueDays={dueDays}
          balance={totals.balance}
          fullyPaid={totals.fullyPaid}
          netMeterInstalledAt={netMeterInstalledAt}
        />
      </SectionCard>

      <SectionCard title="Receipts" description={`${payments.length} recorded`}>
        {paymentsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <EmptyState
            title="No payments recorded"
            description="Log money as it arrives so the outstanding balance stays honest."
            icon={Wallet}
            action={
              <Button size="sm" className="gap-1.5" onClick={openNew}>
                <Plus className="h-4 w-4" /> Add payment
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-card p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold tabular-nums text-foreground">
                      {formatMoney(payment.amount)}
                    </span>
                    <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px] font-semibold">
                      {payment.source === 'bank' ? (
                        <Landmark className="h-3 w-3" />
                      ) : (
                        <Wallet className="h-3 w-3" />
                      )}
                      {payment.source === 'bank' ? 'Bank' : 'Customer'}
                    </Badge>
                    {payment.status !== 'completed' && (
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-semibold capitalize">
                        {payment.status}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {format(new Date(payment.payment_date), 'dd MMM yyyy')}
                    {' · '}
                    {paymentModeLabels[payment.payment_mode] ?? payment.payment_mode}
                    {payment.reference_number ? ` · ${payment.reference_number}` : ''}
                  </p>
                  {payment.notes && (
                    <p className="mt-1 break-words text-xs text-muted-foreground">{payment.notes}</p>
                  )}
                </div>

                {/* Corrections are admin-only: everyone else adds receipts but
                    cannot rewrite one after the fact. */}
                {isAdmin && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 sm:h-8 sm:w-8"
                      onClick={() => openEdit(payment)}
                      aria-label="Edit payment"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 text-destructive hover:text-destructive sm:h-8 sm:w-8"
                      onClick={() => handleDelete(payment)}
                      disabled={deletingId === payment.id}
                      aria-label="Delete payment"
                    >
                      {deletingId === payment.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <PaymentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        payment={editing}
        lockedProject={{ id: projectId, label: projectLabel, paymentType }}
        onSaved={afterSave}
      />
    </div>
  );
};

const toneClasses = {
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
  default: 'text-foreground',
} as const;

const Figure = ({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: keyof typeof toneClasses;
}) => (
  <div className="rounded-xl border border-border/60 bg-muted/30 p-2.5 sm:p-3">
    {/* Three figures across a 375px card leaves ~70px each, which "Outstanding"
        overflows at the usual tracking. */}
    <p className="truncate text-[10px] font-semibold uppercase tracking-tight text-muted-foreground sm:tracking-wider">
      {label}
    </p>
    <p className={`mt-1 text-sm font-extrabold tabular-nums sm:text-base ${toneClasses[tone]}`}>{value}</p>
  </div>
);

/**
 * The collection window, in one line.
 *
 * Deliberately silent before the plant goes live: the clock has not started, so
 * there is nothing to say and a "not due" badge would only add noise.
 */
const DueBanner = ({
  status,
  daysOverdue,
  dueDays,
  balance,
  fullyPaid,
  netMeterInstalledAt,
}: {
  status: ReturnType<typeof dueStatusFor>['status'];
  daysOverdue: number;
  dueDays: number;
  balance: number;
  fullyPaid: boolean;
  netMeterInstalledAt: string | null;
}) => {
  if (fullyPaid) {
    return (
      <Banner tone="success" icon={CheckCircle2}>
        Fully paid. Nothing outstanding.
      </Banner>
    );
  }

  if (!netMeterInstalledAt) {
    return balance > 0 ? (
      <Banner tone="muted" icon={Clock}>
        {formatMoney(balance)} outstanding. The {dueDays}-day collection window opens once the net
        meter is installed.
      </Banner>
    ) : null;
  }

  if (status === 'overdue') {
    return (
      <Banner tone="destructive" icon={AlertTriangle}>
        <strong>{formatMoney(balance)} overdue by {daysOverdue} day{daysOverdue === 1 ? '' : 's'}.</strong>{' '}
        The plant went live on {format(new Date(netMeterInstalledAt), 'dd MMM yyyy')} and payment was
        due within {dueDays} day{dueDays === 1 ? '' : 's'}.
      </Banner>
    );
  }

  if (status === 'due_today') {
    return (
      <Banner tone="warning" icon={Clock}>
        <strong>{formatMoney(balance)} due today.</strong> Last day of the {dueDays}-day window.
      </Banner>
    );
  }

  return (
    <Banner tone="muted" icon={Clock}>
      {formatMoney(balance)} outstanding, due within {dueDays} day{dueDays === 1 ? '' : 's'} of{' '}
      {format(new Date(netMeterInstalledAt), 'dd MMM yyyy')}.
    </Banner>
  );
};

const bannerTones = {
  success: 'border-success/40 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  destructive: 'border-destructive/40 bg-destructive/10 text-destructive',
  muted: 'border-border/60 bg-muted/40 text-muted-foreground',
} as const;

const Banner = ({
  tone,
  icon: Icon,
  children,
}: {
  tone: keyof typeof bannerTones;
  icon: typeof Clock;
  children: React.ReactNode;
}) => (
  <div className={`mt-3 flex items-start gap-2 rounded-xl border p-3 text-xs ${bannerTones[tone]}`}>
    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
    <p className="leading-relaxed">{children}</p>
  </div>
);

export default ProjectPaymentsPanel;
