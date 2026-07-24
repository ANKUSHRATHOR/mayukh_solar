import { useEffect, useState } from 'react';
import { AlertTriangle, IndianRupee, Loader2, MessageCircle, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { calculateSubsidy, formatSubsidy, useSubsidySlabs } from '@/lib/subsidy';
import { sendQuotationNotification } from '@/lib/whatsapp';
import type { LeadQuotation } from '@/lib/leadQuotations';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  customerName: string;
  customerMobile: string | null;
  capacityKw?: number | null;
  /**
   * Existing quotation to edit. When set, fields are prefilled and saving
   * replaces the matching entry (same quotation number) instead of appending.
   */
  editQuote?: LeadQuotation | null;
  onCreated?: () => void;
}

type Step = 'details' | 'confirm';

/**
 * Creates a quotation and offers to send it on WhatsApp.
 *
 * Two steps on purpose. A quotation carries a price and goes straight to a
 * customer's phone; the confirm step shows the exact number and figures before
 * anything leaves the building, because a wrong send cannot be recalled.
 *
 * The quotation is saved regardless of whether the send succeeds — WhatsApp
 * may not be configured yet, and losing the priced quote because a message
 * failed would be worse than a missing notification.
 */
const CreateQuotationDialog = ({
  open,
  onOpenChange,
  leadId,
  customerName,
  customerMobile,
  capacityKw,
  editQuote,
  onCreated,
}: Props) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const subsidySlabs = useSubsidySlabs();

  const [step, setStep] = useState<Step>('details');
  const [saving, setSaving] = useState(false);

  const [capacity, setCapacity] = useState('');
  const [panelBrand, setPanelBrand] = useState('');
  const [panelWatt, setPanelWatt] = useState('');
  const [panelQty, setPanelQty] = useState('');
  const [inverterBrand, setInverterBrand] = useState('');
  const [structureType, setStructureType] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep('details');
    if (editQuote) {
      setCapacity(editQuote.capacity_kw ? String(editQuote.capacity_kw) : '');
      setPanelBrand(editQuote.panel_brand ?? '');
      setPanelWatt(editQuote.panel_watt ? String(editQuote.panel_watt) : '');
      setPanelQty(editQuote.panel_qty ? String(editQuote.panel_qty) : '');
      setInverterBrand(editQuote.inverter_brand ?? '');
      setStructureType(editQuote.structure_type ?? '');
      setTotalCost(editQuote.total_cost ? String(editQuote.total_cost) : '');
    } else {
      setCapacity(capacityKw ? String(capacityKw) : '');
      setPanelBrand('');
      setPanelWatt('');
      setPanelQty('');
      setInverterBrand('');
      setStructureType('');
      setTotalCost('');
    }
    setPhone(customerMobile ?? '');
  }, [open, capacityKw, customerMobile, editQuote]);

  // Panel count follows from capacity and panel wattage — no reason to ask.
  useEffect(() => {
    const kw = Number(capacity);
    const watt = Number(panelWatt);
    if (kw > 0 && watt > 0) setPanelQty(String(Math.ceil((kw * 1000) / watt)));
  }, [capacity, panelWatt]);

  const subsidy = calculateSubsidy(capacity, subsidySlabs);
  const cost = Number(totalCost) || 0;
  const netPrice = Math.max(0, cost - subsidy);

  const detailsValid = Number(capacity) > 0 && cost > 0;
  const phoneValid = /^[6-9]\d{9}$/.test(phone.trim());

  const close = (next: boolean) => {
    if (!next) setStep('details');
    onOpenChange(next);
  };

  const createAndSend = async () => {
    if (!user) return;
    setSaving(true);

    const quotationNumber =
      editQuote?.quotation_number ?? `MS-Q-${Date.now().toString().slice(-8)}`;
    const quote = {
      ...(editQuote ?? {}),
      quotation_number: quotationNumber,
      name: `${customerName} - ${capacity}kW`,
      capacity_kw: Number(capacity),
      panel_brand: panelBrand || null,
      panel_watt: Number(panelWatt) || null,
      panel_qty: Number(panelQty) || null,
      inverter_brand: inverterBrand || null,
      structure_type: structureType || null,
      total_cost: cost,
      subsidy_amount: subsidy,
      net_cost: netPrice,
      quote_price: netPrice,
      status: 'pending',
      created_at: editQuote?.created_at ?? new Date().toISOString(),
      created_by: (editQuote as any)?.created_by ?? user.id,
      updated_at: new Date().toISOString(),
    };

    try {
      // Read-modify-write on the JSONB array. Re-read immediately before
      // writing so a quote added elsewhere in the meantime isn't clobbered.
      const { data: lead, error: readError } = await supabase
        .from('leads')
        .select('quotation_details')
        .eq('id', leadId)
        .single();
      if (readError) throw new Error(readError.message);

      const existing = Array.isArray(lead?.quotation_details)
        ? (lead.quotation_details as any[])
        : [];

      // Editing replaces the matching entry in place; creating appends.
      const idx = editQuote
        ? existing.findIndex((q) => q?.quotation_number === quotationNumber)
        : -1;
      const next =
        idx >= 0
          ? existing.map((q, i) => (i === idx ? quote : q))
          : [...existing, quote];

      const { error: writeError } = await supabase
        .from('leads')
        .update({ quotation_details: next as any })
        .eq('id', leadId);
      if (writeError) throw new Error(writeError.message);

      toast({
        title: editQuote ? 'Quotation updated' : 'Quotation created',
        description: `${quotationNumber} — ${formatSubsidy(netPrice)} after subsidy.`,
      });

      // Sending is best-effort and reported separately, so a messaging problem
      // never looks like a failure to save the quotation.
      const result = await sendQuotationNotification(
        customerName,
        phone.trim(),
        quotationNumber,
        netPrice,
        `${capacity} kW`,
        undefined
      );

      if (result.success) {
        await supabase
          .from('leads')
          .update({ status: 'quotation_sent' as any })
          .eq('id', leadId);
        toast({ title: 'Sent on WhatsApp', description: `Delivered to ${phone.trim()}.` });
      } else {
        toast({
          title: 'Quotation saved, but not sent',
          description:
            result.error ??
            'WhatsApp is not configured. Set it up in Admin Settings, then resend from the lead.',
          variant: 'destructive',
          duration: 12000,
        });
      }

      close(false);
      onCreated?.();
    } catch (err) {
      toast({
        title: 'Could not create the quotation',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {step === 'details'
              ? editQuote
                ? `Edit quotation ${editQuote.quotation_number}`
                : 'Create quotation'
              : 'Confirm before sending'}
          </DialogTitle>
          <DialogDescription>
            {step === 'details'
              ? `System details for ${customerName}. Subsidy is applied automatically by capacity.`
              : 'Check the figures and the number. A sent quotation cannot be recalled.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'details' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Capacity (kW)<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="e.g. 3"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Turnkey cost (₹)<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={totalCost}
                  onChange={(e) => setTotalCost(e.target.value)}
                  placeholder="e.g. 180000"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Panel brand</Label>
                <Input
                  value={panelBrand}
                  onChange={(e) => setPanelBrand(e.target.value)}
                  placeholder="e.g. Waaree"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Panel watt</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={panelWatt}
                  onChange={(e) => setPanelWatt(e.target.value)}
                  placeholder="e.g. 550"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Panel quantity</Label>
                <Input
                  value={panelQty}
                  onChange={(e) => setPanelQty(e.target.value)}
                  placeholder="Auto"
                  className="h-10"
                />
                <p className="text-[11px] text-muted-foreground">
                  Calculated from capacity and watt.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Inverter brand</Label>
                <Input
                  value={inverterBrand}
                  onChange={(e) => setInverterBrand(e.target.value)}
                  placeholder="e.g. Growatt"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold">Structure</Label>
                <Input
                  value={structureType}
                  onChange={(e) => setStructureType(e.target.value)}
                  placeholder="e.g. RCC roof, HDG 80mm"
                  className="h-10"
                />
              </div>
            </div>

            {cost > 0 && (
              <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Turnkey cost</span>
                  <span className="font-semibold">₹{cost.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Central subsidy{capacity ? ` (${capacity} kW)` : ''}
                  </span>
                  <span className="font-semibold text-success">
                    − {formatSubsidy(subsidy)}
                  </span>
                </div>
                <Separator className="my-1.5" />
                <div className="flex justify-between text-base">
                  <span className="font-bold">Customer pays</span>
                  <span className="font-extrabold text-primary">
                    ₹{netPrice.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/40 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-semibold">{customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">System</span>
                <span className="font-semibold">{capacity} kW</span>
              </div>
              <Separator className="my-1.5" />
              <div className="flex justify-between text-base">
                <span className="font-bold">Quoted price</span>
                <span className="inline-flex items-center font-extrabold text-primary">
                  <IndianRupee className="h-4 w-4" />
                  {netPrice.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Send to WhatsApp number</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit mobile"
                className="h-11 font-mono"
              />
              {!phoneValid && phone.length > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Enter a valid 10-digit Indian mobile number.
                </p>
              )}
            </div>

            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              The quotation is saved either way. If WhatsApp isn&rsquo;t configured the
              send is skipped and you can resend later from the lead.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {step === 'details' ? (
            <>
              <Button variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button disabled={!detailsValid} onClick={() => setStep('confirm')}>
                Continue
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep('details')} disabled={saving}>
                Back
              </Button>
              <Button
                onClick={createAndSend}
                disabled={saving || !phoneValid}
                className="gap-2"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {saving ? 'Creating…' : 'Create & send'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateQuotationDialog;
