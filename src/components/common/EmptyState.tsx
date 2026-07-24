import { ReactNode } from 'react';
import { LucideIcon, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** What is missing, e.g. "No quotations yet". */
  title: string;
  /** Why it's empty and what to do about it. */
  description?: string;
  icon?: LucideIcon;
  /** Primary call to action. */
  action?: ReactNode;
  className?: string;
}

/**
 * Shown when a list has no rows. Deliberately distinct from the error state —
 * several existing pages render "No records yet" for both, which makes a failed
 * fetch indistinguishable from genuinely empty data.
 */
const EmptyState = ({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: EmptyStateProps) => (
  <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
    <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 text-muted-foreground">
      <Icon className="h-7 w-7" />
    </div>
    <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
    {description && (
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
    )}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export default EmptyState;
