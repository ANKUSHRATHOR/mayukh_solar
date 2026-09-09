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
import { supabase } from '@/integrations/supabase/client';
import { fetchSystemConfig } from '@/lib/systemConfig';
import { calculateSubsidy, useSubsidySlabs } from '@/lib/subsidy';
import {
  PLANT_FIELDS,
  STRUCTURE_TYPES,
  emptyPlantValues,
  structureTypeLabel,
  toLeadPlantDetails,
  toProjectColumns,
  type PlantOptionKey,
  type PlantValues,
} from '@/lib/plantDetails';

/** Admin-editable in Settings; these are the fallback if the fetch fails. */
export const FALLBACK_PLANT_OPTIONS: Record<PlantOptionKey, string[]> = {
  phase: ['Single Phase', 'Three Phase'],
  panel_make: ['Tata Power', 'Adani Solar', 'Waaree', 'Vikram Solar', 'Loom Solar'],
  panel_wt: ['540W', '550W', '575W', '600W'],
  inverter: ['Growatt', 'Sofar', 'Sungrow', 'Solis', 'Luminous'],
  inverter_wt: ['3 kW', '5 kW', '8 kW', '10 kW', '15 kW', '20 kW'],
  wiremake: ['Polycab', 'Havells', 'KEI', 'Finolex'],
  wire_size: ['4 sqmm', '6 sqmm', '10 sqmm', '16 sqmm'],
  wire_material: ['Copper', 'Aluminum'],
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which store to write. */
  mode: 'lead' | 'project';
  /** Row id of the lead or the project. */
  recordId: string;
  /** Seed values, already mapped by the caller with fromLeadPlantDetails/fromProject. */
  value: PlantValues;
  /**
   * The lead's current `plant_details`. Merged into on save so keys older code
   * wrote are not deleted. Lead mode only.
   */
  existingLeadDetails?: unknown;
  onSaved: () => void;
}

/**
 * The one plant-specification form.
 *
 * A lead kept these specs in an inline dialog writing JSONB; a project kept the
 * same facts in typed columns edited from a different form with free-text
 * brands. Same fields, same dropdowns, both stores — the translation lives in
 * `src/lib/plantDetails.ts` so no screen improvises it again.
 */
const PlantDetailsDialog = ({
  open,
  onOpenChange,
  mode,
  recordId,
  value,
  existingLeadDetails,
  onSaved,
}: Props) => {
  const { toast } = useToast();
  const subsidySlabs = useSubsidySlabs();

  const [options, setOptions] =
    useState<Record<PlantOptionKey, string[]>>(FALLBACK_PLANT_OPTIONS);
  const [values, setValues] = useState<PlantValues>(emptyPlantValues());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    fetchSystemConfig<Partial<Record<PlantOptionKey, string[]>>>('plant_details_dropdown_options')
      .then((cfg) => cfg && setOptions({ ...FALLBACK_PLANT_OPTIONS, ...cfg }))
      .catch(() => undefined);
  }, [open]);

  const set = <K extends keyof PlantValues>(key: K, next: PlantValues[K]) =>
    setValues((v) => ({ ...v, [key]: next }));

  const defaultSubsidy = useMemo(
    () => calculateSubsidy(values.capacityKw, subsidySlabs),
    [values.capacityKw, subsidySlabs]
  );

  const save = async () => {
    setSaving(true);
    try {
      const table = mode === 'lead' ? 'leads' : 'projects';
      const payload =
        mode === 'lead'
          ? { plant_details: toLeadPlantDetails(values, existingLeadDetails) }
          : toProjectColumns(values);

      const { data, error } = await supabase
        .from(table as any)
        .update(payload as any)
        .eq('id', recordId)
        .select('id');

      if (error) throw new Error(error.message);
      // PostgREST answers 200 with an empty array when a policy filters the row
      // out, so a successful call that changed nothing is a permission problem.
      if (!data || data.length === 0) {
        throw new Error('No rows were updated — row level security refused the write.');
      }

      toast({ title: 'Plant details saved' });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({
        title: 'Could not save plant details',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const dropdown = (label: string, key: keyof PlantValues, optionKey: PlantOptionKey) => {
    const current = String(values[key] ?? '');
    const list = options[optionKey] ?? [];
    // A stored value that is no longer in the admin's option list still has to
    // round-trip, or opening the dialog and saving would silently blank it.
    const withCurrent = current && !list.includes(current) ? [current, ...list] : list;
    return (
      <div className="space-y-1.5">
        <Label className="font-semibold text-foreground">{label}</Label>
        <Select value={current} onValueChange={(v) => set(key, v as never)}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder={`Select ${label}`} />
          </SelectTrigger>
          <SelectContent>
            {withCurrent.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  const numberField = (label: string, key: keyof PlantValues, placeholder: string) => (
    <div className="space-y-1.5">
      <Label className="font-semibold text-foreground">{label}</Label>
      <Input
        type="number"
        value={String(values[key] ?? '')}
        onChange={(e) => set(key, e.target.value as never)}
        placeholder={placeholder}
        className="h-9 text-xs"
      />
    </div>
  );

  const structureOptions =
    values.structureType && !(STRUCTURE_TYPES as readonly string[]).includes(values.structureType)
      ? [values.structureType, ...STRUCTURE_TYPES]
      : [...STRUCTURE_TYPES];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Only the fields scroll — the title and Save stay put on a form this tall. */}
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
          <DialogTitle className="text-base font-bold">Plant Details</DialogTitle>
          <DialogDescription>
            Panel, inverter and wiring specification for this{' '}
            {mode === 'lead' ? 'lead' : 'project'}.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            {PLANT_FIELDS.map((field) =>
              field.options
                ? (
                  <div key={field.key}>{dropdown(field.label, field.key, field.options)}</div>
                ) : (
                  <div key={field.key}>
                    {numberField(field.label, field.key, field.key === 'panelQty' ? 'e.g. 6' : 'e.g. 3')}
                  </div>
                )
            )}

            <div className="space-y-1.5">
              <Label className="font-semibold text-foreground">Structure</Label>
              <Select
                value={values.structureType}
                onValueChange={(v) => set('structureType', v)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select Structure" />
                </SelectTrigger>
                <SelectContent>
                  {structureOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {structureTypeLabel(opt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator className="my-2" />

          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3">
            <div className="space-y-1.5">
              <Label className="font-semibold text-foreground">Total Cost (₹)</Label>
              <Input
                type="number"
                value={values.totalCost}
                onChange={(e) => set('totalCost', e.target.value)}
                placeholder="e.g. 180000"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="font-semibold text-foreground">Subsidy Applied</Label>
              <div className="flex h-9 items-center gap-2">
                <Button
                  type="button"
                  variant={values.subsidyApplied ? 'default' : 'outline'}
                  className="h-7 w-14 text-[10px]"
                  onClick={() => set('subsidyApplied', true)}
                >
                  YES
                </Button>
                <Button
                  type="button"
                  variant={!values.subsidyApplied ? 'default' : 'outline'}
                  className="h-7 w-14 text-[10px]"
                  onClick={() => {
                    set('subsidyApplied', false);
                    set('subsidyAmount', '');
                  }}
                >
                  NO
                </Button>
              </div>
            </div>

            {values.subsidyApplied && (
              <div className="col-span-2 space-y-1.5">
                <Label className="font-semibold text-foreground">Subsidy Amount (₹)</Label>
                <Input
                  type="number"
                  value={values.subsidyAmount}
                  onChange={(e) => set('subsidyAmount', e.target.value)}
                  placeholder={`Default: ${defaultSubsidy}`}
                  className="h-9 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  PM Surya Ghar is slab-based by capacity. Leave blank to use the slab
                  default for {values.capacityKw || '—'} kW.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/60 px-6 py-4 sm:gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Plant Details'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PlantDetailsDialog;
