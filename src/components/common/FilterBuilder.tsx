import { useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import FiltersPopover from '@/components/dashboard/FiltersPopover';
import { cn } from '@/lib/utils';
import {
  countApplied,
  defaultOperator,
  isComplete,
  newConditionId,
  operatorsFor,
  valueInputFor,
  type FilterCondition,
  type FilterField,
} from '@/lib/filterConditions';

interface FilterBuilderProps {
  // `never` so a page's FilterField<Lead>[] is accepted: the builder never
  // calls `get`, it only reads the field's shape.
  fields: FilterField<never>[];
  /** The applied conditions. */
  value: FilterCondition[];
  onApply: (conditions: FilterCondition[]) => void;
}

// Compact on desktop, where the popover sits over the list; phone height stays
// at 40px so the controls remain comfortable to tap.
const control = 'h-10 px-2.5 text-sm sm:h-8 sm:text-xs';

const blankRow = (fields: FilterField<never>[]): FilterCondition => ({
  id: newConditionId(),
  field: fields[0].key,
  op: defaultOperator(fields[0]),
});

/**
 * The Filters popover as a condition builder: each row is field · condition ·
 * value, rows are ANDed, and nothing reaches the list until Apply.
 *
 * Editing happens on a draft, so half-built rows never refetch the list on
 * every keystroke. Apply is refused while a row is incomplete rather than
 * silently dropping it — a filter the reader typed and did not get is worse
 * than one more click.
 */
const FilterBuilder = ({ fields, value, onApply }: FilterBuilderProps) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterCondition[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  const applied = countApplied(value, fields);

  const onOpenChange = (next: boolean) => {
    if (next) {
      // Reopening starts from what is applied, never from an abandoned draft.
      setDraft(value.length > 0 ? value : [blankRow(fields)]);
      setShowErrors(false);
    }
    setOpen(next);
  };

  const update = (id: string, patch: Partial<FilterCondition>) =>
    setDraft((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const setField = (id: string, key: string) => {
    const field = fields.find((f) => f.key === key)!;
    // A new field means a new type: its old condition and value mean nothing.
    setDraft((rows) =>
      rows.map((r) => (r.id === id ? { id, field: key, op: defaultOperator(field) } : r))
    );
  };

  const setOp = (row: FilterCondition, op: FilterCondition['op']) => {
    const field = fields.find((f) => f.key === row.field)!;
    const sameInput = valueInputFor(field.type, row.op) === valueInputFor(field.type, op);
    update(row.id, sameInput ? { op } : { op, value: undefined, value2: undefined, values: undefined });
  };

  const incomplete = draft.filter((r) => !isComplete(r, fields));

  const apply = () => {
    if (incomplete.length > 0) {
      setShowErrors(true);
      return;
    }
    onApply(draft);
    setOpen(false);
  };

  const clearAll = () => {
    onApply([]);
    setDraft([blankRow(fields)]);
    setShowErrors(false);
  };

  return (
    <FiltersPopover
      activeCount={applied}
      onClear={clearAll}
      open={open}
      onOpenChange={onOpenChange}
      contentClassName="w-[min(94vw,520px)] space-y-2.5 p-3"
      bodyClassName="space-y-2.5"
    >
      <div className="space-y-1.5">
        {draft.map((row, i) => {
          const field = fields.find((f) => f.key === row.field) ?? fields[0];
          const input = valueInputFor(field.type, row.op);
          const invalid = showErrors && !isComplete(row, fields);
          return (
            <div key={row.id} className="space-y-1.5">
              {i > 0 && (
                <p className="text-[10px] font-semibold uppercase leading-none tracking-wider text-muted-foreground">and</p>
              )}
              <div
                className={cn(
                  'flex items-start gap-1.5 rounded-md border border-transparent',
                  invalid && 'border-destructive/50 bg-destructive/5 p-1'
                )}
              >
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
                  <Select value={row.field} onValueChange={(v) => setField(row.id, v)}>
                    <SelectTrigger className={control} aria-label="Field">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fields.map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={row.op} onValueChange={(v) => setOp(row, v as FilterCondition['op'])}>
                    <SelectTrigger className={control} aria-label="Condition">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {operatorsFor(field).map((o) => (
                        <SelectItem key={o.op} value={o.op}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className={cn('col-span-2 min-w-0 sm:col-span-1', input === 'none' && 'hidden sm:block')}>
                    <ValueInput
                      input={input}
                      field={field}
                      row={row}
                      onChange={(patch) => update(row.id, patch)}
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive sm:h-8 sm:w-8"
                  aria-label={`Remove ${field.label} filter`}
                  onClick={() => setDraft((rows) => rows.filter((r) => r.id !== row.id))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}

        {draft.length === 0 && (
          <p className="py-1 text-xs text-muted-foreground">No filters. Add one to narrow the list.</p>
        )}
      </div>

      {showErrors && incomplete.length > 0 && (
        <p className="text-xs font-medium text-destructive">
          Fill in or remove the highlighted {incomplete.length === 1 ? 'filter' : 'filters'} to apply.
        </p>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 gap-1 px-2 text-xs text-primary sm:h-8"
          onClick={() => setDraft((rows) => [...rows, blankRow(fields)])}
        >
          <Plus className="h-3.5 w-3.5" /> Add filter
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="h-10 px-3 text-xs sm:h-8" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" className="h-10 px-4 text-xs sm:h-8" onClick={apply}>
            Apply
          </Button>
        </div>
      </div>
    </FiltersPopover>
  );
};

interface ValueInputProps {
  input: ReturnType<typeof valueInputFor>;
  field: FilterField<never>;
  row: FilterCondition;
  onChange: (patch: Partial<FilterCondition>) => void;
}

const ValueInput = ({ input, field, row, onChange }: ValueInputProps) => {
  switch (input) {
    case 'none':
      return null;
    case 'text':
      return (
        <Input className={control} value={row.value ?? ''} placeholder="Value" onChange={(e) => onChange({ value: e.target.value })} />
      );
    case 'number':
      return (
        <Input className={control} type="number" inputMode="decimal" value={row.value ?? ''} placeholder="Number" onChange={(e) => onChange({ value: e.target.value })} />
      );
    case 'days':
      return (
        <div className="relative">
          <Input className={cn(control, 'pr-12')} type="number" min={1} inputMode="numeric" value={row.value ?? ''} placeholder="7" onChange={(e) => onChange({ value: e.target.value })} />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">days</span>
        </div>
      );
    case 'date':
      return <Input className={control} type="date" value={row.value ?? ''} onChange={(e) => onChange({ value: e.target.value })} />;
    case 'month':
      return <Input className={control} type="month" value={row.value ?? ''} onChange={(e) => onChange({ value: e.target.value })} />;
    case 'number_range':
    case 'date_range': {
      const type = input === 'date_range' ? 'date' : 'number';
      return (
        <div className="flex items-center gap-1">
          <Input className={cn(control, 'min-w-0')} type={type} aria-label="From" value={row.value ?? ''} onChange={(e) => onChange({ value: e.target.value })} />
          <span className="shrink-0 text-xs text-muted-foreground">to</span>
          <Input className={cn(control, 'min-w-0')} type={type} aria-label="To" value={row.value2 ?? ''} onChange={(e) => onChange({ value2: e.target.value })} />
        </div>
      );
    }
    case 'option':
      return (
        <Select value={row.value ?? ''} onValueChange={(v) => onChange({ value: v })}>
          <SelectTrigger className={control} aria-label="Value">
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'options': {
      const selected = row.values ?? [];
      const labelOf = (v: string) => field.options?.find((o) => o.value === v)?.label ?? v;
      const summary =
        selected.length === 0 ? 'Choose…' : selected.length === 1 ? labelOf(selected[0]) : `${selected.length} selected`;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={cn(control, 'w-full justify-between bg-background font-normal', selected.length === 0 && 'text-muted-foreground')}
            >
              <span className="truncate">{summary}</span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            {(field.options ?? []).map((o) => (
              <DropdownMenuCheckboxItem
                key={o.value}
                checked={selected.includes(o.value)}
                // Keep the menu open while ticking several.
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(checked) =>
                  onChange({
                    values: checked ? [...selected, o.value] : selected.filter((v) => v !== o.value),
                  })
                }
              >
                {o.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
  }
};

export default FilterBuilder;
