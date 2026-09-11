import { cn } from '@/lib/utils';

/**
 * The same tone vocabulary as `lib/statusMeta.ts`, deliberately — one word for
 * one meaning across the app. Two vocabularies is how `danger` and
 * `destructive` end up meaning the same thing in different files.
 */
export type StatTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface StatItem {
  label: string;
  value: string | number;
  /** Colours the value only. Status is never colour alone — the label carries the meaning. */
  tone?: StatTone;
  /** A short qualifier under the value, e.g. "Awaiting first installment". */
  hint?: string;
  /** Makes the item a filter shortcut, as the KPI tiles were. */
  onClick?: () => void;
}

const toneClasses: Record<StatTone, string> = {
  neutral: 'text-foreground',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
};

/**
 * The figures above a list, as one compact row.
 *
 * List pages used a grid of `StatCard`s — six bordered, shadowed, icon-bearing
 * tiles on Projects — which put 509px of chrome above the first record on a
 * 1400px screen. Six cards competing with the records is the wrong hierarchy for
 * a page whose subject is the records; a card is right on a dashboard, where the
 * tile *is* the content.
 *
 * So: no box, no icon, no accent glow. A hairline-separated row that scrolls
 * sideways on a phone rather than wrapping into a ragged grid — which is also
 * what let Projects render 4, 5 or 6 tiles (it varies by role) into a 4-column
 * grid and leave a stranded last row.
 *
 * `StatCard` is unchanged and stays the right choice for dashboards.
 */
const StatStrip = ({ items, className }: { items: StatItem[]; className?: string }) => {
  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        'flex items-stretch gap-px overflow-x-auto rounded-xl border border-border/70 bg-card',
        className
      )}
    >
      {items.map((item) => {
        const interactive = typeof item.onClick === 'function';
        return (
          <div
            key={item.label}
            onClick={item.onClick}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            onKeyDown={
              interactive
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      item.onClick?.();
                    }
                  }
                : undefined
            }
            className={cn(
              'min-w-[6.25rem] flex-1 shrink-0 px-3 py-2 sm:min-w-[7.5rem] sm:px-4 sm:py-2.5',
              // Hairlines between items instead of a border per tile: one
              // surface reads as a summary, six surfaces read as six things.
              'border-l border-border/60 first:border-l-0',
              interactive &&
                'cursor-pointer transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
            )}
          >
            {/* Wraps rather than truncates — "THIS MON…" costs the reader the
                word. `items-stretch` keeps every column as tall as the tallest,
                so a wrapping label plus a hint made this strip 94px on a phone,
                taller than the page header and toolbar combined for the least
                important band on the page. Dropping the hint below `sm` is what
                buys the wrap back. */}
            <p className="text-[10px] font-semibold uppercase leading-tight tracking-[0.12em] text-muted-foreground">
              {item.label}
            </p>
            <p
              className={cn(
                'mt-0.5 text-base font-extrabold leading-none tabular-nums sm:text-lg',
                toneClasses[item.tone ?? 'neutral']
              )}
            >
              {item.value}
            </p>
            {item.hint && (
              // Below sm the hint is the first thing to go: it qualifies a figure
              // the reader can already see, on a strip that is itself secondary
              // to the records underneath it.
              <p className="mt-1 hidden truncate text-[10px] text-muted-foreground sm:block">
                {item.hint}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default StatStrip;
