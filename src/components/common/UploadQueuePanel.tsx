import { useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { dismissJob, useUploadQueue } from '@/lib/uploadQueue';

/**
 * Upload progress, bottom-right, the way Drive shows it.
 *
 * A document goes browser → edge function → Google, so an upload is seconds
 * rather than milliseconds. Previously that time was spent inside a disabled
 * button with a spinner, which blocks the page and says nothing about how far
 * along it is. Here the work is visible, several uploads can run at once, and
 * the user can carry on with the rest of the screen.
 *
 * Completed rows clear themselves; failed ones stay until dismissed, so an
 * upload can never be lost quietly.
 */
const UploadQueuePanel = () => {
  const jobs = useUploadQueue();
  const [collapsed, setCollapsed] = useState(false);

  if (jobs.length === 0) return null;

  const active = jobs.filter((job) => job.status === 'uploading').length;
  const failed = jobs.filter((job) => job.status === 'error').length;

  const heading = failed > 0
    ? `${failed} upload${failed === 1 ? '' : 's'} failed`
    : active > 0
      ? `Uploading ${active} item${active === 1 ? '' : 's'}`
      : 'Uploads complete';

  return (
    <div
      className={cn(
        // Above the content but below dialogs, and clear of the mobile safe area.
        'fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))]',
        'overflow-hidden rounded-xl border border-border bg-card shadow-elevated'
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-3 py-2">
        <p className="min-w-0 truncate text-sm font-semibold text-foreground">{heading}</p>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? 'Show uploads' : 'Hide uploads'}
        >
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {!collapsed && (
        <ul className="max-h-64 divide-y divide-border/50 overflow-y-auto">
          {jobs.map((job) => (
            <li key={job.id} className="flex items-start gap-2.5 px-3 py-2.5">
              <span className="mt-0.5 shrink-0">
                {job.status === 'uploading' && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {job.status === 'done' && <CheckCircle2 className="h-4 w-4 text-success" />}
                {job.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">{job.label}</p>

                {job.status === 'uploading' && (
                  <Progress value={job.progress} className="mt-1.5 h-1" />
                )}
                {job.status === 'error' && (
                  <p className="mt-0.5 break-words text-[11px] text-destructive">{job.error}</p>
                )}
              </div>

              {job.status !== 'uploading' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => dismissJob(job.id)}
                  aria-label={`Dismiss ${job.label}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default UploadQueuePanel;
