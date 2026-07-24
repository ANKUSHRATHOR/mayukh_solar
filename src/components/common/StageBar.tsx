import { cn } from '@/lib/utils';
import { toneClasses, type StatusTone } from '@/lib/statusMeta';

export interface StageBarItem {
  value: string;
  label: string;
  count: number;
  tone?: StatusTone;
}

interface StageBarProps {
  items: StageBarItem[];
  /** Currently selected stage, or null for "all". */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Label for the leading "everything" segment. */
  allLabel?: string;
  allCount?: number;
  className?: string;
}

/**
 * Horizontal pipeline of chevrons, each showing a stage count and filtering on
 * click.
 *
 * Replaces a flat row of filter chips. The chevron shape carries the ordering
 * information the chips lost — you can see at a glance where records pile up
 * and which stage precedes which.
 */
const StageBar = ({
  items,
  value,
  onChange,
  allLabel = 'All',
  allCount,
  className,
}: StageBarProps) => {
  const total = allCount ?? items.reduce((sum, i) => sum + i.count, 0);

  const segment = (
    key: string,
    label: string,
    count: number,
    active: boolean,
    tone: StatusTone | undefined,
    onClick: () => void,
    isFirst: boolean,
    isLast: boolean
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`${label} — ${count}`}
      className={cn(
        'group relative flex shrink-0 items-center gap-2 py-2.5 pl-5 pr-4 text-left transition-colors',
        // The notch is cut with clip-path rather than borders so adjacent
        // segments interlock cleanly at any width.
        !isFirst && 'pl-7',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
      )}
      style={{
        clipPath: isLast
          ? isFirst
            ? undefined
            : 'polygon(14px 0, 100% 0, 100% 100%, 14px 100%, 0 50%)'
          : isFirst
            ? 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)'
            : 'polygon(14px 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 14px 100%, 0 50%)',
      }}
    >
      <span className="whitespace-nowrap text-xs font-semibold">{label}</span>
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
          active
            ? 'bg-primary-foreground/20 text-primary-foreground'
            : tone
              ? toneClasses[tone]
              : 'bg-muted text-muted-foreground'
        )}
      >
        {count}
      </span>
    </button>
  );

  return (
    <div
      className={cn(
        'flex w-full items-stretch gap-0.5 overflow-x-auto rounded-2xl border border-border/70 bg-muted/30 p-1',
        className
      )}
      role="group"
      aria-label="Filter by stage"
    >
      {segment(
        '__all',
        allLabel,
        total,
        value === null,
        undefined,
        () => onChange(null),
        true,
        items.length === 0
      )}
      {items.map((item, index) =>
        segment(
          item.value,
          item.label,
          item.count,
          value === item.value,
          item.tone,
          // Clicking the active stage clears the filter, so the bar is a toggle
          // and never traps the user on one stage.
          () => onChange(value === item.value ? null : item.value),
          false,
          index === items.length - 1
        )
      )}
    </div>
  );
};

export default StageBar;
