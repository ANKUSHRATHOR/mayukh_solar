import { ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from './ErrorState';

interface DetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Badges shown under the title. */
  meta?: ReactNode;
  children: ReactNode;
  /** Pinned to the bottom of the drawer, above the safe area. */
  footer?: ReactNode;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
}

/**
 * Side panel for records that don't warrant their own route — payments,
 * dispatches, serial numbers, status notes.
 *
 * Full-width on mobile so content isn't squeezed; a fixed rail on desktop so
 * the user keeps their place in the list behind it.
 */
const DetailDrawer = ({
  open,
  onOpenChange,
  title,
  description,
  meta,
  children,
  footer,
  isLoading,
  error,
  onRetry,
}: DetailDrawerProps) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      side="right"
      className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
    >
      <SheetHeader className="space-y-2 border-b border-border/60 px-5 py-4 text-left">
        <SheetTitle className="text-base font-bold">{title}</SheetTitle>
        {description && (
          <SheetDescription className="text-sm">{description}</SheetDescription>
        )}
        {meta && <div className="flex flex-wrap items-center gap-2 pt-0.5">{meta}</div>}
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : (
          children
        )}
      </div>

      {footer && (
        <div className="border-t border-border/60 bg-background/85 px-5 py-3 backdrop-blur">
          {footer}
        </div>
      )}
    </SheetContent>
  </Sheet>
);

export default DetailDrawer;
