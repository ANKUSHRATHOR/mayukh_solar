import { Check, Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type ProjectStatus = string;

// Ordered workflow stages. Loan/Cash diverge briefly then merge.
const COMMON_PRE = ['pending_documents', 'pending_operator_review', 'registration_pending', 'registration_done'] as const;
const CASH_BRANCH = ['cash_file'] as const;
const LOAN_BRANCH = ['loan_process', 'loan_done'] as const;
const COMMON_POST = [
  'material_ordered',
  'material_dispatched',
  'material_delivered',
  'installation_pending',
  'installation_done',
  'wiring_pending',
  'wiring_done',
  'net_metering_submitted',
  'inspection_scheduled',
  'inspection_completed',
  'net_meter_installed',
  'project_completed',
] as const;

const STAGE_LABELS: Record<string, string> = {
  pending_documents: 'Documents',
  pending_operator_review: 'Operator Review',
  registration_pending: 'Registration',
  registration_done: 'Registered',
  loan_process: 'Loan Process',
  loan_done: 'Loan Approved',
  cash_file: 'Cash File',
  material_ordered: 'Material Ordered',
  material_dispatched: 'Dispatched',
  material_delivered: 'Delivered',
  installation_pending: 'Install Pending',
  installation_done: 'Installed',
  wiring_pending: 'Wiring Pending',
  wiring_done: 'Wired',
  net_metering_submitted: 'Net Metering',
  inspection_scheduled: 'Inspection Scheduled',
  inspection_completed: 'Inspection Done',
  net_meter_installed: 'Net Meter',
  project_completed: 'Completed',
};

const buildFlow = (paymentType: 'cash' | 'loan') => [
  ...COMMON_PRE,
  ...(paymentType === 'cash' ? CASH_BRANCH : LOAN_BRANCH),
  ...COMMON_POST,
];

interface Props {
  status: ProjectStatus;
  paymentType: 'cash' | 'loan';
  compact?: boolean;
}

export default function ProjectTimeline({ status, paymentType, compact = false }: Props) {
  const flow = buildFlow(paymentType);
  const currentIdx = flow.indexOf(status);
  const isFailed = status === 'inspection_failed';
  const pct = currentIdx >= 0 ? Math.round(((currentIdx + 1) / flow.length) * 100) : 0;

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-muted-foreground">
            Stage {Math.max(currentIdx + 1, 1)} of {flow.length}
          </span>
          <span className="font-semibold text-foreground">{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              isFailed ? 'bg-destructive' : 'bg-gradient-to-r from-primary to-primary/70'
            )}
            style={{ width: `${Math.max(pct, 4)}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {paymentType === 'cash' ? 'Cash' : 'Loan'} Workflow
        </p>
        <span className="text-xs font-semibold text-primary">{pct}% complete</span>
      </div>
      <ol className="relative ml-3 space-y-3 border-l border-border pl-5">
        {flow.map((stage, idx) => {
          const isDone = currentIdx > idx;
          const isCurrent = currentIdx === idx;
          return (
            <li key={stage} className="relative">
              <span
                className={cn(
                  'absolute -left-[1.7rem] flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-background',
                  isDone && 'bg-primary text-primary-foreground',
                  isCurrent && !isFailed && 'bg-primary/20 text-primary',
                  isCurrent && isFailed && 'bg-destructive text-destructive-foreground',
                  !isDone && !isCurrent && 'bg-muted text-muted-foreground'
                )}
              >
                {isDone ? (
                  <Check className="h-3 w-3" />
                ) : isCurrent ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Circle className="h-2 w-2" />
                )}
              </span>
              <p
                className={cn(
                  'text-sm',
                  isCurrent ? 'font-semibold text-foreground' : isDone ? 'text-foreground/80' : 'text-muted-foreground'
                )}
              >
                {STAGE_LABELS[stage] || stage}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
