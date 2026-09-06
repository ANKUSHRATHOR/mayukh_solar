import { useEffect, useMemo, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { fetchSystemConfig } from '@/lib/systemConfig';
import { calculateSubsidy, useSubsidySlabs } from '@/lib/subsidy';
import { saveLeadQuotation, type LeadQuotation } from '@/lib/leadQuotations';
import { supabase } from '@/integrations/supabase/client';

/** Plant dropdowns are admin-editable; these are the fallback if the fetch fails. */
const FALLBACK_OPTIONS: Record<string, string[]> = {
  phase: ['Single Phase', 'Three Phase'],
  panel_make: ['Tata Power', 'Adani Solar', 'Waaree', 'Vikram Solar', 'Loom Solar'],
  panel_wt: ['540W', '550W', '575W', '600W'],
  inverter: ['Growatt', 'Sofar', 'Sungrow', 'Solis', 'Luminous'],
  inverter_wt: ['3 kW', '5 kW', '8 kW', '10 kW', '15 kW', '20 kW'],
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  customerName: string;
  /** Prefills capacity on a new quotation. */
  capacityKw?: number | null;
  /** Pass a quotation to edit it; null creates a new one. */
  editQuote?: LeadQuotation | null;
  createdByName?: string | null;
  onSaved: () => void;
}

/**
 * The one quotation form.
 *
 * This is the lead page's form, lifted out so the visit page uses it too — a
 * surveyor and a telecaller quoting the same customer were filling in two
 * different sets of fields against the same `leads.quotation_details` array.
 */
const QuotationFormDialog = ({
  open,
  onOpenChange,
  leadId,
  customerName,
  capacityKw,
  editQuote,
  createdByName,
  onSaved,
}: Props) => {
  const { toast } = useToast();
  const subsidySlabs = useSubsidySlabs();

  const [options, setOptions] = useState<Record<string, string[]>>(FALLBACK_OPTIONS);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');
  const [phase, setPhase] = useState('');
  const [panelBrand, setPanelBrand] = useState('');
  const [panelWatt, setPanelWatt] = useState('');
  const [panelQty, setPanelQty] = useState('');
  const [inverterBrand, setInverterBrand] = useState('');
  const [inverterCapacity, setInverterCapacity] = useState('');
  const [structureType, setStructureType] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [subsidyApplied, setSubsidyApplied] = useState(false);
  const [subsidyAmount, setSubsidyAmount] = useState('');
  const [price, setPrice] = useState('');

  const defaultSubsidy = useMemo(
    () => calculateSubsidy(capacity, subsidySlabs),
    [capacity, subsidySlabs]
  );

  useEffect(() => {
    if (!open) return;
    fetchSystemConfig<Record<string, string[]>>('plant_details_dropdown_options')
      .then((value) => value && setOptions({ ...FALLBACK_OPTIONS, ...value }))
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    if (editQuote) {
      const q = editQuote;
      setName(q.name ?? '');
      setCapacity(q.capacity_kw != null ? String(q.capacity_kw) : '');
      setPhase(q.phase ?? '');
      setPanelBrand(q.panel_brand ?? '');
      setPanelWatt(q.panel_watt != null ? String(q.panel_watt) : '');
      setPanelQty(q.panel_qty != null ? String(q.panel_qty) : '');
      setInverterBrand(q.inverter_brand ?? '');
      setInverterCapacity(q.inverter_capacity != null ? String(q.inverter_capacity) : '');
      setStructureType(q.structure_type ?? '');
      setTotalCost(q.total_cost != null ? String(q.total_cost) : '');
      setSubsidyApplied(Boolean(q.subsidy_amount));
      setSubsidyAmount(q.subsidy_amount ? String(q.subsidy_amount) : '');
      setPrice(q.quote_price != null ? String(q.quote_price) : '');
      return;
    }

    // A new quotation is mostly the plant specs already captured on the lead,
    // so it starts from those rather than an empty form. Prefilling lives here
    // so it happens wherever the form is opened from, not only the lead page.
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('leads')
        .select('customer_name, kw_interest, plant_details, quotation_details')
        .eq('id', leadId)
        .maybeSingle();
      if (cancelled) return;

      const pd = ((data?.plant_details as any) || {}) as Record<string, any>;
      const raw = data?.quotation_details;
      const count = Array.isArray(raw) ? raw.length : raw && typeof raw === 'object' ? 1 : 0;
      const cap = pd.required_capacity || data?.kw_interest || capacityKw || '';
      const digits = (v: unknown) => (v ? String(v).replace(/\D/g, '') : '');

      setCapacity(cap ? String(cap) : '');
      setPhase(pd.phase || '');
      setPanelBrand(pd.panel_make || '');
      setPanelWatt(digits(pd.panel_wt));
      setPanelQty(pd.panel_qty ? String(pd.panel_qty) : '');
      setInverterBrand(pd.inverter || '');
      setInverterCapacity(digits(pd.inverter_wt));
      setStructureType(pd.structure_type_gauge_make || '');
      setTotalCost(pd.total_cost ? String(pd.total_cost) : '');
      setSubsidyApplied(Boolean(pd.subsidy));
      setSubsidyAmount(
        pd.subsidy ? String(pd.subsidy_amount || calculateSubsidy(cap, subsidySlabs)) : ''
      );
      setName(
        `${data?.customer_name || customerName || 'Client'} - ${String(count + 1).padStart(2, '0')} - ${cap ? `${cap}kW` : '3kW'}`
      );
    })();

    return () => {
      cancelled = true;
    };
    // subsidySlabs is only a fallback for the seeded amount; re-running on it
    // would overwrite what the user has typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editQuote, leadId, capacityKw, customerName]);

  // Offered price follows turnkey minus subsidy until the user overrides it.
  useEffect(() => {
    if (!open) return;
    const turnkey = Number(totalCost) || 0;
    const sub = subsidyApplied ? Number(subsidyAmount) || defaultSubsidy : 0;
    setPrice(String(Math.max(0, turnkey - sub) || ''));
  }, [totalCost, subsidyApplied, subsidyAmount, defaultSubsidy, open]);

  const priceNum = Number(price);
  const canSave = Boolean(name.trim()) && priceNum > 0 && !Number.isNaN(priceNum);

  const save = async () => {
    setSaving(true);
    try {
      const sub = subsidyApplied ? Number(subsidyAmount) || defaultSubsidy : 0;
      const saved = await saveLeadQuotation(
        leadId,
        {
          name: name.trim() || `${customerName} quotation`,
          capacity_kw: Number(capacity) || null,
          phase: phase || null,
          panel_brand: panelBrand || null,
          panel_watt: Number(panelWatt) || null,
          panel_qty: Number(panelQty) || null,
          inverter_brand: inverterBrand || null,
          inverter_capacity: Number(inverterCapacity) || null,
          structure_type: structureType || null,
          total_cost: Number(totalCost) || null,
          subsidy_amount: sub,
          net_cost: (Number(totalCost) || 0) - sub,
          quote_price: priceNum,
        },
        { editingNumber: editQuote?.quotation_number ?? null, createdBy: createdByName }
      );

      toast({
        title: editQuote ? 'Quotation updated' : 'Quotation created',
        description: `Quotation No: ${saved.quotation_number}`,
      });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({
        title: 'Could not save the quotation',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const dropdown = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    key: string,
    placeholder: string
  ) => (
    <div className="space-y-1.5">
      <Label className="font-semibold text-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-xs">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {(options[key] || []).map((opt) => (
            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            {editQuote ? 'Edit Quotation Details' : 'Create Quotation'}
          </DialogTitle>
          <DialogDescription>
            Provide specific panel brands, capacity, and cost details for this quotation version.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3 text-xs">
          <div className="space-y-1.5">
            <Label className="font-semibold text-foreground">Quotation Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. customer_name - 01 - 3kW"
              className="h-9 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-semibold text-foreground">Capacity (kW) *</Label>
              <Input
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="e.g. 3"
                className="h-9 text-xs"
              />
            </div>
            {dropdown('Grid Phase', phase, setPhase, 'phase', 'Select Phase')}
            {dropdown('Panel Brand', panelBrand, setPanelBrand, 'panel_make', 'Select Panel Brand')}
            {dropdown('Panel Wattage (W)', panelWatt, setPanelWatt, 'panel_wt', 'Select Panel Wattage')}
            <div className="space-y-1.5">
              <Label className="font-semibold text-foreground">Panel Qty</Label>
              <Input
                type="number"
                value={panelQty}
                onChange={(e) => setPanelQty(e.target.value)}
                placeholder="e.g. 6"
                className="h-9 text-xs"
              />
            </div>
            {dropdown('Inverter Brand', inverterBrand, setInverterBrand, 'inverter', 'Select Inverter')}
            {dropdown('Inverter Capacity (kW)', inverterCapacity, setInverterCapacity, 'inverter_wt', 'Select Inverter Capacity')}
            <div className="space-y-1.5">
              <Label className="font-semibold text-foreground">Structure Specs / Gauge</Label>
              <Input
                value={structureType}
                onChange={(e) => setStructureType(e.target.value)}
                placeholder="e.g. HDG 80mm"
                className="h-9 text-xs"
              />
            </div>
          </div>

          <Separator className="my-2" />

          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3">
            <div className="space-y-1.5">
              <Label className="font-semibold text-foreground">Turnkey Cost (₹) *</Label>
              <Input
                type="number"
                value={totalCost}
                onChange={(e) => setTotalCost(e.target.value)}
                placeholder="e.g. 180000"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="font-semibold text-foreground">Subsidy Applied</Label>
              <div className="flex h-9 items-center gap-2">
                <Button
                  type="button"
                  variant={subsidyApplied ? 'default' : 'outline'}
                  className="h-7 w-14 text-[10px]"
                  onClick={() => setSubsidyApplied(true)}
                >
                  YES
                </Button>
                <Button
                  type="button"
                  variant={!subsidyApplied ? 'default' : 'outline'}
                  className="h-7 w-14 text-[10px]"
                  onClick={() => {
                    setSubsidyApplied(false);
                    setSubsidyAmount('');
                  }}
                >
                  NO
                </Button>
              </div>
            </div>

            {subsidyApplied && (
              <div className="col-span-2 space-y-1.5">
                <Label className="font-semibold text-foreground">Subsidy Amount (₹)</Label>
                <Input
                  type="number"
                  value={subsidyAmount}
                  onChange={(e) => setSubsidyAmount(e.target.value)}
                  placeholder={`Default: ${defaultSubsidy}`}
                  className="h-9 text-xs"
                />
              </div>
            )}

            <div className="col-span-2 space-y-1.5">
              <Label className="font-semibold text-foreground">Offered Deal Quote Price (₹) *</Label>
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Final offered price"
                className="h-9 text-xs font-bold text-primary"
              />
              <p className="text-[10px] text-muted-foreground">
                Calculated Turnkey − Subsidy. You can override it.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t pt-3 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!canSave || saving} size="sm">
            {saving ? 'Saving…' : editQuote ? 'Save Changes' : 'Generate Quote'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QuotationFormDialog;
