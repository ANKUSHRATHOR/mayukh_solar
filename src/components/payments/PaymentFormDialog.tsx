import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2, Search, Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatMoney, paymentModeLabels } from '@/lib/payments';
import {
  createPayment,
  projectOptionLabel,
  searchProjectsForPayment,
  updatePayment,
  PAYMENT_MODES,
  type PaymentInput,
  type PaymentMode,
  type PaymentRow,
  type ProjectOption,
} from '@/lib/paymentsData';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing an existing payment; omit to record a new one. */
  payment?: PaymentRow | null;
  /**
   * Pre-selects a project and hides the picker. Used from a project's Payments
   * tab, where the project is never in question.
   */
  lockedProject?: { id: string; label: string; paymentType: 'cash' | 'loan' } | null;
  onSaved?: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Records, corrects or links an inward payment.
 *
 * One dialog for all three because they are the same form: linking is just an
 * edit that fills in the project. The project picker is the only unusual part —
 * a payment may legitimately arrive before anyone knows which project it
 * belongs to, so "no project" is a supported answer rather than a validation
 * failure, in two flavours: leave it blank and it lands in the unallocated
 * inbox to be matched later; tick "general income" and it stays unlinked for
 * good.
 */
const PaymentFormDialog = ({
  open,
  onOpenChange,
  payment = null,
  lockedProject = null,
  onSaved,
}: Props) => {
  const { toast } = useToast();
  const isEdit = Boolean(payment);

  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('bank_transfer');
  const [source, setSource] = useState<'customer' | 'bank'>('customer');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [payerName, setPayerName] = useState('');
  const [notes, setNotes] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState<string>('');
  const [noProjectNeeded, setNoProjectNeeded] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset from props each time the dialog opens, so a cancelled edit doesn't
  // leak into the next one.
  useEffect(() => {
    if (!open) return;
    setAmount(payment ? String(payment.amount) : '');
    setPaymentDate(payment?.payment_date ?? today());
    setPaymentMode(payment?.payment_mode ?? 'bank_transfer');
    setSource(payment?.source ?? 'customer');
    setReferenceNumber(payment?.reference_number ?? '');
    setPayerName(payment?.payer_name ?? '');
    setNotes(payment?.notes ?? '');
    setProjectId(payment?.project_id ?? lockedProject?.id ?? null);
    setProjectLabel(
      payment?.k_number ?? payment?.customer_name ?? lockedProject?.label ?? ''
    );
    setNoProjectNeeded(payment?.no_project_needed ?? false);
    setProjectSearch('');
  }, [open, payment, lockedProject]);

  const debouncedSearch = useDebouncedValue(projectSearch, 300);
  const showPicker = !lockedProject && !noProjectNeeded;

  const optionsQuery = useQuery({
    queryKey: ['payments', 'project-options', debouncedSearch],
    queryFn: () => searchProjectsForPayment(debouncedSearch),
    enabled: open && showPicker,
  });

  const selectedType: 'cash' | 'loan' | null =
    lockedProject?.paymentType ??
    optionsQuery.data?.find((o) => o.id === projectId)?.payment_type ??
    payment?.payment_type ??
    null;

  // The bank is only ever a payer on a loan file. Offering the choice on a cash
  // project invites a receipt that no reconciliation will ever match.
  const showSource = selectedType === 'loan';

  const amountValue = Number(amount);
  const amountValid = amount.trim() !== '' && Number.isFinite(amountValue) && amountValue > 0;

  const chooseProject = (option: ProjectOption) => {
    setProjectId(option.id);
    setProjectLabel(projectOptionLabel(option));
    setProjectSearch('');
    if (option.payment_type !== 'loan') setSource('customer');
  };

  const clearProject = () => {
    setProjectId(null);
    setProjectLabel('');
    setSource('customer');
  };

  const handleSubmit = async () => {
    if (!amountValid) {
      toast({
        title: 'Enter an amount',
        description: 'A payment needs a positive amount.',
        variant: 'destructive',
      });
      return;
    }

    const input: PaymentInput = {
      project_id: noProjectNeeded ? null : projectId,
      no_project_needed: noProjectNeeded,
      amount: amountValue,
      payment_date: paymentDate,
      payment_mode: paymentMode,
      // Only a loan file can receive bank money; everything else is the customer.
      source: showSource ? source : 'customer',
      reference_number: referenceNumber.trim() || null,
      payer_name: payerName.trim() || null,
      notes: notes.trim() || null,
      // Staff log money they have already taken, so it is received, not claimed.
      status: payment?.status ?? 'completed',
    };

    setSaving(true);
    try {
      if (payment) await updatePayment(payment.id, input, payment);
      else await createPayment(input);

      toast({
        title: payment ? 'Payment updated' : 'Payment recorded',
        description:
          !input.project_id && !input.no_project_needed
            ? `${formatMoney(amountValue)} saved to the unallocated inbox — link it to a project when you know which one.`
            : `${formatMoney(amountValue)} saved.`,
      });
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: payment ? 'Could not update the payment' : 'Could not record the payment',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const options = useMemo(() => optionsQuery.data ?? [], [optionsQuery.data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            {isEdit ? 'Edit payment' : 'Record payment'}
          </DialogTitle>
          <DialogDescription>
            {lockedProject
              ? `Money received for ${lockedProject.label}.`
              : 'Money received. Leave the project blank if you do not know it yet.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="payment-amount" className="text-xs font-semibold">
                Amount <span className="text-destructive">*</span>
              </Label>
              <Input
                id="payment-amount"
                type="number"
                inputMode="decimal"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="h-11 text-base tabular-nums sm:h-10 sm:text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment-date" className="text-xs font-semibold">
                Received on
              </Label>
              <Input
                id="payment-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="h-11 text-base sm:h-10 sm:text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Mode</Label>
              <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as PaymentMode)}>
                <SelectTrigger className="h-11 sm:h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {paymentModeLabels[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {showSource && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Paid by</Label>
                <Select value={source} onValueChange={(v) => setSource(v as 'customer' | 'bank')}>
                  <SelectTrigger className="h-11 sm:h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="payment-reference" className="text-xs font-semibold">
                Reference / UTR
              </Label>
              <Input
                id="payment-reference"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Optional"
                className="h-11 text-base sm:h-10 sm:text-sm"
              />
            </div>

            {!projectId && (
              <div className="space-y-1.5">
                <Label htmlFor="payment-payer" className="text-xs font-semibold">
                  Paid by (name)
                </Label>
                <Input
                  id="payment-payer"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  placeholder="Who handed this over"
                  className="h-11 text-base sm:h-10 sm:text-sm"
                />
              </div>
            )}
          </div>

          {!lockedProject && (
            <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-semibold">Project</Label>
                {projectId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={clearProject}
                  >
                    <X className="h-3 w-3" /> Clear
                  </Button>
                )}
              </div>

              {projectId ? (
                <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate text-sm font-semibold">{projectLabel}</span>
                </div>
              ) : (
                showPicker && (
                  <>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        placeholder="Search K-Number, name or mobile…"
                        className="h-11 pl-9 text-base sm:h-10 sm:text-sm"
                        aria-label="Search for a project"
                      />
                    </div>

                    <div className="max-h-44 space-y-1 overflow-y-auto">
                      {optionsQuery.isLoading ? (
                        <div className="flex items-center gap-2 px-1 py-3 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                        </div>
                      ) : options.length === 0 ? (
                        <p className="px-1 py-3 text-xs text-muted-foreground">
                          No matching project. Save without one and link it later.
                        </p>
                      ) : (
                        options.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => chooseProject(option)}
                            className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold">
                                {projectOptionLabel(option)}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {option.customer_name}
                                {option.mobile ? ` · ${option.mobile}` : ''}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                              {formatMoney(option.final_amount)}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )
              )}

              {!projectId && (
                <label className="flex items-start gap-2.5 pt-1 text-xs">
                  <Checkbox
                    checked={noProjectNeeded}
                    onCheckedChange={(v) => setNoProjectNeeded(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-semibold">This money has no project</span>
                    <span className="block text-muted-foreground">
                      General income. Keeps it out of the unallocated inbox for good.
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="payment-notes" className="text-xs font-semibold">
              Notes
            </Label>
            <Textarea
              id="payment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 sm:h-10"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11 gap-2 sm:h-10"
            onClick={handleSubmit}
            disabled={saving || !amountValid}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Record payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentFormDialog;
