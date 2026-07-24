import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Eye, FileText, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import SectionCard from '@/components/common/SectionCard';
import ErrorState from '@/components/common/ErrorState';
import QuotationPreviewDialog from '@/components/leads/QuotationPreviewDialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { toneClasses } from '@/lib/statusMeta';
import {
  deleteLeadQuotation,
  fetchLeadQuotations,
  quotationStatusLabels,
  quotedPrice,
  type LeadQuotation,
} from '@/lib/leadQuotations';

interface Props {
  leadId: string;
  /** Opens the quotation dialog prefilled for this quote. Omit to hide Edit. */
  onEdit?: (quote: LeadQuotation) => void;
}

const toneFor = (status: string | null | undefined) => {
  switch (status) {
    case 'accepted':
      return toneClasses.success;
    case 'rejected':
      return toneClasses.danger;
    case 'sent':
      return toneClasses.info;
    default:
      return toneClasses.neutral;
  }
};

/**
 * Quotations raised for a lead.
 *
 * Shown on the visit page so a surveyor can see what has already been quoted.
 * Reads the same `leads.quotation_details` array as the lead record, and the
 * row actions mirror the lead page's (view / edit / delete) — creation stays
 * on the lead record, so a visit never mints a competing quotation.
 */
const LeadQuotationsPanel = ({ leadId, onEdit }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [previewQuote, setPreviewQuote] = useState<LeadQuotation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeadQuotation | null>(null);

  const query = useQuery({
    queryKey: ['lead-quotations', leadId],
    queryFn: () => fetchLeadQuotations(leadId),
  });

  const deleteMutation = useMutation({
    mutationFn: (quotationNumber: string) => deleteLeadQuotation(leadId, quotationNumber),
    onSuccess: () => {
      toast({ title: 'Quotation deleted' });
      queryClient.invalidateQueries({ queryKey: ['lead-quotations', leadId] });
    },
    onError: (err) => {
      toast({
        title: 'Could not delete the quotation',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    },
    onSettled: () => setDeleteTarget(null),
  });

  const quotations = query.data ?? [];

  return (
    <>
      <SectionCard title="Quotations" icon={FileText} contentClassName="p-0">
        {query.isLoading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : quotations.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No quotation raised yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {quotations.map((q: LeadQuotation) => (
              <li key={q.quotation_number} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-foreground">
                        {q.quotation_number}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'px-1.5 py-0 text-[9px] font-bold uppercase',
                          toneFor(q.status)
                        )}
                      >
                        {quotationStatusLabels[q.status ?? 'pending'] ?? q.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[
                        q.capacity_kw ? `${q.capacity_kw} kW` : null,
                        q.panel_qty && q.panel_watt
                          ? `${q.panel_qty} × ${q.panel_watt}W`
                          : null,
                        q.panel_brand,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                    {q.created_at && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {format(new Date(q.created_at), 'dd MMM yyyy, h:mm a')}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-start gap-1">
                    <div className="text-right">
                      <p className="text-sm font-extrabold tabular-nums text-foreground">
                        ₹{quotedPrice(q).toLocaleString('en-IN')}
                      </p>
                      {Number(q.subsidy_amount) > 0 && (
                        <p className="text-[11px] text-success">
                          after ₹{Number(q.subsidy_amount).toLocaleString('en-IN')} subsidy
                        </p>
                      )}
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          aria-label={`Actions for ${q.quotation_number}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          onClick={() => setPreviewQuote(q)}
                          className="gap-2 cursor-pointer text-sm"
                        >
                          <Eye className="h-4 w-4 text-muted-foreground" /> View
                        </DropdownMenuItem>
                        {onEdit && (
                          <DropdownMenuItem
                            onClick={() => onEdit(q)}
                            className="gap-2 cursor-pointer text-sm"
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" /> Edit
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(q)}
                          className="gap-2 cursor-pointer text-sm text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <QuotationPreviewDialog
        open={Boolean(previewQuote)}
        onOpenChange={(open) => !open && setPreviewQuote(null)}
        leadId={leadId}
        quote={previewQuote}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete quotation {deleteTarget?.quotation_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from the lead as well — both views share the same
              quotations. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.quotation_number);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default LeadQuotationsPanel;
