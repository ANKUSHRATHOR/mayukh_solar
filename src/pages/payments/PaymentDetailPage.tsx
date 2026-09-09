import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ExternalLink,
  Inbox,
  Landmark,
  Link2,
  Loader2,
  Pencil,
  Trash2,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import DetailShell from '@/components/common/DetailShell';
import SectionCard from '@/components/common/SectionCard';
import DetailField, { DetailGrid } from '@/components/common/DetailField';
import PaymentFormDialog from '@/components/payments/PaymentFormDialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { allocationLabels, formatMoney, paymentModeLabels } from '@/lib/payments';
import {
  deletePayment,
  fetchPayment,
  fetchStaffNames,
  type PaymentRow,
} from '@/lib/paymentsData';

/**
 * One payment, and everything you can do to it.
 *
 * A routed page rather than a dialog because a receipt is the record you get
 * asked about later — "which project did that ₹50,000 go to?" — and a URL can
 * be shared, bookmarked and linked to from the project's own ledger.
 */
const PaymentDetailPage = () => {
  const { paymentId } = useParams<{ paymentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const paymentQuery = useQuery({
    queryKey: ['payments', 'detail', paymentId],
    queryFn: () => fetchPayment(paymentId!),
    enabled: Boolean(paymentId),
  });
  const payment = paymentQuery.data;

  const staffQuery = useQuery({
    queryKey: ['payments', 'staff', payment?.created_by, payment?.updated_by],
    queryFn: () => fetchStaffNames([payment!.created_by, payment!.updated_by]),
    enabled: Boolean(payment),
  });
  const staff = staffQuery.data ?? {};

  const refresh = () => {
    paymentQuery.refetch();
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  };

  const handleDelete = async () => {
    if (!payment) return;
    setDeleting(true);
    try {
      await deletePayment(payment.id, payment);
      toast({
        title: 'Payment deleted',
        description: `${formatMoney(payment.amount)} removed from the ledger.`,
      });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate('/payments');
    } catch (error) {
      toast({
        title: 'Could not delete the payment',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  // A payment is identified by its amount and date; the customer, when there is
  // one, is named by K-Number first per the house convention.
  const title = payment ? formatMoney(payment.amount) : 'Payment';
  const unallocated = payment ? !payment.project_id && !payment.no_project_needed : false;

  return (
    <DetailShell
      title={title}
      description={
        payment
          ? `Received ${format(new Date(payment.payment_date), 'dd MMM yyyy')} by ${
              paymentModeLabels[payment.payment_mode] ?? payment.payment_mode
            }`
          : undefined
      }
      icon={Wallet}
      backTo="/payments"
      isLoading={paymentQuery.isLoading}
      error={paymentQuery.error}
      onRetry={() => paymentQuery.refetch()}
      notFound={!paymentQuery.isLoading && !paymentQuery.error && !payment}
      notFoundTitle="Payment not found"
      meta={
        payment && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className={
                unallocated ? 'gap-1 border-info/40 bg-info/10 text-info' : 'gap-1'
              }
            >
              {unallocated && <Inbox className="h-3 w-3" />}
              {allocationLabels[payment.allocation]}
            </Badge>
            {payment.status !== 'completed' && (
              <Badge variant="outline" className="capitalize">
                {payment.status}
              </Badge>
            )}
          </div>
        )
      }
      actions={
        payment && (
          <div className="flex flex-wrap gap-2">
            {/* Assigning is the one action an unallocated payment exists for, so
                it leads rather than hiding inside "Edit". */}
            {isAdmin && (
              <Button
                variant={unallocated ? 'default' : 'outline'}
                size="sm"
                className="h-11 gap-2 sm:h-9"
                onClick={() => setEditOpen(true)}
              >
                {unallocated ? (
                  <>
                    <Link2 className="h-4 w-4" /> Assign to project
                  </>
                ) : (
                  <>
                    <Pencil className="h-4 w-4" /> Edit
                  </>
                )}
              </Button>
            )}
            {isAdmin && !unallocated && (
              <Button
                variant="outline"
                size="sm"
                className="h-11 gap-2 sm:h-9"
                onClick={() => setEditOpen(true)}
                aria-label="Change the project this payment belongs to"
              >
                <Link2 className="h-4 w-4" />
                <span className="hidden sm:inline">Change project</span>
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="h-11 gap-2 text-destructive hover:text-destructive sm:h-9"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
            )}
          </div>
        )
      }
      aside={
        payment && (
          <SectionCard title="Record">
            <DetailGrid className="lg:grid-cols-2">
              <DetailField
                label="Logged by"
                value={payment.created_by ? staff[payment.created_by] : null}
                emptyText="Unknown"
              />
              <DetailField
                label="Logged on"
                value={format(new Date(payment.created_at), 'dd MMM yyyy, HH:mm')}
              />
              <DetailField
                label="Last edited by"
                value={payment.updated_by ? staff[payment.updated_by] : null}
                emptyText="Never edited"
              />
              <DetailField
                label="Last edited"
                value={
                  payment.updated_by
                    ? format(new Date(payment.updated_at), 'dd MMM yyyy, HH:mm')
                    : null
                }
                emptyText="—"
              />
            </DetailGrid>
          </SectionCard>
        )
      }
    >
      {payment && (
        <>
          <SectionCard title="Payment" icon={Wallet}>
            <DetailGrid>
              <DetailField
                label="Amount"
                value={
                  <span className="text-lg font-extrabold tabular-nums">
                    {formatMoney(payment.amount)}
                  </span>
                }
              />
              <DetailField
                label="Received on"
                value={format(new Date(payment.payment_date), 'dd MMM yyyy')}
              />
              <DetailField
                label="Mode"
                value={paymentModeLabels[payment.payment_mode] ?? payment.payment_mode}
              />
              <DetailField
                label="Paid by"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    {payment.source === 'bank' ? (
                      <>
                        <Landmark className="h-3.5 w-3.5 text-muted-foreground" /> Bank
                      </>
                    ) : (
                      <>
                        <Wallet className="h-3.5 w-3.5 text-muted-foreground" /> Customer
                      </>
                    )}
                  </span>
                }
              />
              <DetailField label="Reference / UTR" value={payment.reference_number} />
              <DetailField label="Payer name" value={payment.payer_name} />
              <DetailField label="Notes" value={payment.notes} wide />
            </DetailGrid>
          </SectionCard>

          <SectionCard
            title="Project"
            icon={Link2}
            actions={
              payment.project_id && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 gap-1.5 text-xs font-semibold sm:h-8"
                  onClick={() => navigate(`/projects/${payment.project_id}?tab=payments`)}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open project
                </Button>
              )
            }
          >
            {payment.project_id ? (
              <DetailGrid>
                <DetailField label="K-Number" value={payment.k_number} emptyText="Not linked" />
                <DetailField label="Customer" value={payment.customer_name} />
                <DetailField
                  label="Mobile"
                  value={
                    payment.mobile && (
                      <a
                        href={`tel:${payment.mobile}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {payment.mobile}
                      </a>
                    )
                  }
                />
                <DetailField
                  label="Project value"
                  value={payment.final_amount ? formatMoney(payment.final_amount) : null}
                />
                <DetailField
                  label="Payment type"
                  value={payment.payment_type === 'loan' ? 'Loan' : 'Cash'}
                />
              </DetailGrid>
            ) : payment.no_project_needed ? (
              <p className="text-sm text-muted-foreground">
                Marked as general income. It belongs to no project and is deliberately kept out of
                the unallocated inbox.
              </p>
            ) : (
              <div className="flex flex-col items-start gap-3 rounded-xl border border-info/40 bg-info/10 p-3">
                <p className="text-sm text-info">
                  This payment is not linked to a project yet, so it is not counted against any
                  customer's balance.
                </p>
                {isAdmin && (
                  <Button size="sm" className="h-11 gap-2 sm:h-9" onClick={() => setEditOpen(true)}>
                    <Link2 className="h-4 w-4" /> Assign to project
                  </Button>
                )}
              </div>
            )}
          </SectionCard>
        </>
      )}

      {payment && (
        <PaymentFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          payment={payment}
          onSaved={refresh}
        />
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Delete this payment?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {payment && (
                <>
                  {formatMoney(payment.amount)} received on{' '}
                  {format(new Date(payment.payment_date), 'dd MMM yyyy')} will be removed from the
                  ledger
                  {payment.k_number ? `, raising ${payment.k_number}'s outstanding balance` : ''}.
                  This cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Deleting is async and navigates on success; let it finish
                // rather than letting the dialog close out from under it.
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DetailShell>
  );
};

export default PaymentDetailPage;
