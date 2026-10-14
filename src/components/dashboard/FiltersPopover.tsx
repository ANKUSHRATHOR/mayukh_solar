import { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FiltersPopoverProps {
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  /** Controlled open state, for content that closes itself (an Apply button). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Overrides the panel's width, for content wider than a column of fields. */
  contentClassName?: string;
  /** Overrides the spacing between the panel's children. */
  bodyClassName?: string;
}

const FiltersPopover = ({
  activeCount,
  onClear,
  children,
  align = 'end',
  open,
  onOpenChange,
  contentClassName,
  bodyClassName,
}: FiltersPopoverProps) => {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Filters"
          className="relative h-10 w-10 shrink-0 gap-0 border-border bg-card p-0 hover:bg-accent/40 sm:h-9 sm:w-auto sm:gap-2 sm:px-3"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {/* Icon-only below sm so the toolbar stays one row on a phone. The
              corner dot still reports that filters are applied; the count badge
              would not fit a square button. */}
          <span className="hidden text-sm font-medium sm:inline">Filters</span>
          {activeCount > 0 && (
            <span className="ml-1 hidden items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold sm:inline-flex">
              {activeCount}
            </span>
          )}
          {activeCount > 0 && (
            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={8}
        className={cn(
          'w-[min(92vw,360px)] max-h-[70vh] overflow-y-auto p-4 space-y-4 bg-popover border-border shadow-elevated',
          contentClassName
        )}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Filters</p>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Clear All
            </button>
          )}
        </div>
        <div className={cn('space-y-4', bodyClassName)}>{children}</div>
      </PopoverContent>
    </Popover>
  );
};

export default FiltersPopover;
