import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ProjectPaymentsPanel from '@/components/projects/ProjectPaymentsPanel';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  finalAmount: number;
  paymentType: 'cash' | 'loan';
  /** K-Number, then name, then mobile — the house identity order. */
  projectLabel: string;
  netMeterInstalledAt: string | null;
  onChanged?: () => void;
}

/**
 * The project payments ledger in a dialog, for the two screens that reach money
 * from a list rather than a detail page (the Operator project console).
 *
 * A wrapper rather than a second implementation: ProjectPaymentsPanel is also
 * the project detail page's Payments tab, so the totals, the collection-window
 * banner and the admin-only edit rules cannot drift between the two.
 */
const ProjectPaymentsDialog = ({
  open,
  onOpenChange,
  projectId,
  finalAmount,
  paymentType,
  projectLabel,
  netMeterInstalledAt,
  onChanged,
}: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Payments</DialogTitle>
        <DialogDescription>{projectLabel}</DialogDescription>
      </DialogHeader>

      <ProjectPaymentsPanel
        projectId={projectId}
        finalAmount={finalAmount}
        paymentType={paymentType}
        projectLabel={projectLabel}
        netMeterInstalledAt={netMeterInstalledAt}
        onChanged={onChanged}
      />
    </DialogContent>
  </Dialog>
);

export default ProjectPaymentsDialog;
