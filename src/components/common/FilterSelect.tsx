import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  /** Label for the no-filter choice, whose value is always `all`. */
  allLabel: string;
}

/**
 * One labelled field inside a `FiltersPopover`. Every list's popover is built
 * from these, so the filters read the same on every page.
 *
 * A value missing from `options` — a stale sticky choice, or a person no longer
 * in the directory — keeps an entry of its own; otherwise the trigger renders
 * blank while the filter is still applied.
 */
const FilterSelect = ({ label, value, onChange, options, allLabel }: FilterSelectProps) => {
  const known = value === 'all' || options.some((o) => o.value === value);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-11 text-sm sm:h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {!known && <SelectItem value={value}>{value}</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default FilterSelect;
