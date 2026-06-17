import { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { SlidersHorizontal, X } from 'lucide-react';

interface FiltersPopoverProps {
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
}

const FiltersPopover = ({ activeCount, onClear, children, align = 'end' }: FiltersPopoverProps) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 relative border-border bg-card hover:bg-accent/40"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="text-sm font-medium">Filters</span>
          {activeCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
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
        className="w-[min(92vw,360px)] max-h-[70vh] overflow-y-auto p-4 space-y-4 bg-popover border-border shadow-elevated"
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
        <div className="space-y-4">{children}</div>
      </PopoverContent>
    </Popover>
  );
};

export default FiltersPopover;
