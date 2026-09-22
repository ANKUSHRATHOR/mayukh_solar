import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import WorkItemsPanel, { BUCKET_LABELS } from './WorkItemsPanel';
import type { WorkBucket } from '@/lib/performanceData';

export interface DrillDown {
  bucket: WorkBucket;
  /** Overrides the bucket's own wording when a tile phrased it differently. */
  title?: string;
  staff?: string | null;
  role?: string | null;
}

interface WorkDrillDownDialogProps {
  drill: DrillDown | null;
  onOpenChange: (open: boolean) => void;
  from: string;
  to: string;
  periodLabel: string;
}

/**
 * The records behind a figure.
 *
 * Opened from a KPI tile or a count in the leaderboard, and backed by the same
 * function with the same bucket, so the dialog is the tile's own rows rather
 * than a second opinion about them.
 */
const WorkDrillDownDialog = ({
  drill,
  onOpenChange,
  from,
  to,
  periodLabel,
}: WorkDrillDownDialogProps) => (
  <Dialog open={Boolean(drill)} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-5xl">
      {drill && (
        <>
          <DialogHeader>
            <DialogTitle>{drill.title ?? BUCKET_LABELS[drill.bucket]}</DialogTitle>
            <DialogDescription>
              {periodLabel} · {from} to {to}. These are the exact records counted in the figure you
              opened.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto">
            <WorkItemsPanel
              from={from}
              to={to}
              role={drill.role}
              staff={drill.staff}
              bucket={drill.bucket}
              dense
            />
          </div>
        </>
      )}
    </DialogContent>
  </Dialog>
);

export default WorkDrillDownDialog;
