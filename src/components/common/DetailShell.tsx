import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import PageContainer from './PageContainer';
import PageHeader from './PageHeader';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';

interface DetailShellProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Where the back button goes — the list this record came from. */
  backTo: string;
  /** Status badges or record codes, shown beside the title. */
  meta?: ReactNode;
  actions?: ReactNode;
  /** Main column content — usually a stack of `SectionCard`s. */
  children: ReactNode;
  /** Optional right rail on desktop; stacks under the main column on mobile. */
  aside?: ReactNode;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** True when the record genuinely doesn't exist (as opposed to a fetch error). */
  notFound?: boolean;
  notFoundTitle?: string;
  className?: string;
}

/**
 * Layout for a routed single-record page.
 *
 * Distinguishes loading, error and not-found rather than collapsing all three
 * into one message — existing detail pages render "Lead not found" whether the
 * record is missing, RLS blocked the read, or the network dropped.
 */
const DetailShell = ({
  title,
  description,
  icon,
  backTo,
  meta,
  actions,
  children,
  aside,
  isLoading,
  error,
  onRetry,
  notFound,
  notFoundTitle = 'Record not found',
  className,
}: DetailShellProps) => {
  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-3.5 w-72" />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <PageHeader title={title} back={backTo} />
        <ErrorState error={error} onRetry={onRetry} />
      </PageContainer>
    );
  }

  if (notFound) {
    return (
      <PageContainer>
        <PageHeader title={title} back={backTo} />
        <EmptyState
          title={notFoundTitle}
          description="It may have been deleted, or you may not have access to it."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer className={className}>
      <PageHeader
        title={title}
        description={description}
        icon={icon}
        back={backTo}
        meta={meta}
        actions={actions}
      />

      <div
        className={cn(
          'grid gap-4',
          aside ? 'grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]' : 'grid-cols-1'
        )}
      >
        <div className="min-w-0 space-y-4">{children}</div>
        {aside && <div className="min-w-0 space-y-4">{aside}</div>}
      </div>
    </PageContainer>
  );
};

export default DetailShell;
