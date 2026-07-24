import { ReactNode, useState } from 'react';
import { ChevronDown, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionCardProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Right-aligned controls in the header (edit buttons, counts). */
  actions?: ReactNode;
  children: ReactNode;
  /**
   * When set, the section collapses. Detail pages on mobile should collapse
   * secondary sections so the primary content isn't buried under a long scroll.
   */
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
  contentClassName?: string;
}

/**
 * A titled block within a detail or form page. Gives every module the same
 * section rhythm instead of each page inventing its own card treatment.
 */
const SectionCard = ({
  title,
  description,
  icon: Icon,
  actions,
  children,
  collapsible = false,
  defaultOpen = true,
  className,
  contentClassName,
}: SectionCardProps) => {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = collapsible ? open : true;

  const header = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{title}</p>
          {description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {collapsible && (
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform duration-200',
              isOpen && 'rotate-180'
            )}
          />
        )}
      </div>
    </div>
  );

  return (
    <section className={cn('rounded-2xl border border-border/70 bg-card shadow-card', className)}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={isOpen}
          className="w-full rounded-t-2xl px-4 py-3.5 text-left transition-colors hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {header}
        </button>
      ) : (
        <div className="border-b border-border/60 px-4 py-3.5">{header}</div>
      )}

      {isOpen && (
        <div className={cn('px-4 py-4', collapsible && 'border-t border-border/60', contentClassName)}>
          {children}
        </div>
      )}
    </section>
  );
};

export default SectionCard;
