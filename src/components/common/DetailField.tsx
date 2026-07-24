import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DetailFieldProps {
  label: string;
  /** Rendered when non-empty. Falsy scalars fall back to `emptyText`. */
  value?: ReactNode;
  /** Shown in place of an absent value. */
  emptyText?: string;
  /** Span the full width of the parent grid — for addresses, notes. */
  wide?: boolean;
  className?: string;
}

const isEmpty = (value: ReactNode): boolean =>
  value === null || value === undefined || value === '' || value === false;

/**
 * A label/value row for detail views. Replaces the several bespoke `InfoRow`
 * implementations scattered across pages, so an absent value reads the same
 * everywhere instead of rendering "null" or a blank gap.
 */
const DetailField = ({
  label,
  value,
  emptyText = '—',
  wide = false,
  className,
}: DetailFieldProps) => (
  <div className={cn('min-w-0', wide && 'sm:col-span-2 lg:col-span-3', className)}>
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {label}
    </p>
    <div
      className={cn(
        'mt-1 break-words text-sm',
        isEmpty(value) ? 'text-muted-foreground/60' : 'font-medium text-foreground'
      )}
    >
      {isEmpty(value) ? emptyText : value}
    </div>
  </div>
);

/** Responsive grid sized for DetailField rows. */
export const DetailGrid = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn('grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
    {children}
  </div>
);

export default DetailField;
