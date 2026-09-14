import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cancelVisit, deleteVisit, type SiteVisit } from '@/lib/visits';

interface Props {
  /** The visit to act on; null closes the dialog. */
  visit: SiteVisit | null;
  /**
   * `cancel` keeps the visit in history, marked cancelled with a reason — what
   * staff do. `delete` removes it permanently and is admin-only on the server.
   */
  mode: 'cancel' | 'delete';
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}

const CancelVisitDialog = ({ visit, mode, onOpenChange, onDone }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visit) setReason('');
  }, [visit]);

  const when = visit?.scheduled_for ?? visit?.visit_date;
  const whenLabel = when ? format(new Date(when), 'dd MMM yyyy, h:mm a') : 'this visit';
  const isDelete = mode === 'delete';

  const handleConfirm = async () => {
    if (!visit) return;
    if (!isDelete && !reason.trim()) {
      toast({ title: 'Reason required', description: 'Say why the visit is cancelled.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      if (isDelete) await deleteVisit(visit.id);
      else await cancelVisit(visit.id, reason.trim());

      toast({ title: isDelete ? 'Visit deleted' : 'Visit cancelled' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lead-visits', visit.lead_id] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
        queryClient.invalidateQueries({ queryKey: ['visit', visit.id] }),
      ]);
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      toast({
        title: isDelete ? 'Could not delete the visit' : 'Could not cancel the visit',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={Boolean(visit)} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isDelete ? 'Delete this visit permanently?' : 'Cancel this visit?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {isDelete
              ? `The visit on ${whenLabel} is removed from the lead's history. A copy is kept in the activity log. To keep it on record, cancel it instead.`
              : `The visit on ${whenLabel} stays in the lead's history, marked cancelled. If no other visit is booked, the lead moves to Follow Up.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!isDelete && (
          <div className="space-y-1.5">
            <Label htmlFor="cancel-visit-reason" className="text-xs font-semibold">Reason *</Label>
            <Textarea
              id="cancel-visit-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer asked to postpone, booked by mistake…"
              rows={3}
              autoFocus
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep visit</AlertDialogCancel>
          {/* A plain Button, not AlertDialogAction: Action closes the dialog on
              click, before the request has had a chance to fail. */}
          <Button
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={busy || (!isDelete && !reason.trim())}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isDelete ? 'Delete visit' : 'Cancel visit'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CancelVisitDialog;
