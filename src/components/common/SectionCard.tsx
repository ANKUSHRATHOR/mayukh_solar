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

  const titleBlock = (
    <div className="flex min-w-0 items-center gap-2.5">
      {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-foreground">{title}</p>
        {description && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );

  const chevron = collapsible && (
    <ChevronDown
      className={cn(
        'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
        isOpen && 'rotate-180'
      )}
    />
  );

  return (
    <section className={cn('rounded-2xl border border-border/70 bg-card shadow-card', className)}>
      {collapsible ? (
        // The toggle covers the title and the chevron, never the whole header.
        // `actions` are buttons, and a <button> inside a <button> is invalid
        // HTML: React warns, and the browser fires both — so pressing Export
        // also collapsed the section it was exporting.
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={isOpen}
            className="-mx-1 flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {titleBlock}
            {chevron}
          </button>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3.5">
          {titleBlock}
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
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
