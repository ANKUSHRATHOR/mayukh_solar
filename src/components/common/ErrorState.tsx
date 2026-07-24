import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  /** The underlying failure. Shown verbatim — keep RLS/Postgres jargon out of `title`. */
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}

const messageOf = (error: unknown): string | null => {
  if (!error) return null;
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'message' in error) return String((error as any).message);
  return null;
};

/**
 * Shown when a fetch fails. Kept separate from EmptyState so users can tell
 * "nothing here" apart from "we couldn't load it" — and so there is a retry.
 */
const ErrorState = ({
  title = "Couldn't load this",
  error,
  onRetry,
  className,
}: ErrorStateProps) => {
  const detail = messageOf(error);

  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      {detail && (
        <p className="mt-2 max-w-md break-words rounded bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
          {detail}
        </p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5 gap-2" onClick={onRetry}>
          <RotateCw className="h-4 w-4" /> Try again
        </Button>
      )}
    </div>
  );
};

export default ErrorState;
