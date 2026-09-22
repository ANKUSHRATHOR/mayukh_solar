import { CalendarRange, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PERIOD_LABELS, type PeriodKey, type PeriodRange } from '@/lib/performance';
import { cn } from '@/lib/utils';

export interface PerformanceControlsValue {
  period: PeriodKey;
  customFrom: string;
  customTo: string;
  role: string;
  staff: string;
}

interface EmployeeOption {
  user_id: string;
  full_name: string;
  role: string;
}

interface PerformanceControlsProps {
  value: PerformanceControlsValue;
  onChange: (next: PerformanceControlsValue) => void;
  range: PeriodRange;
  employees: EmployeeOption[];
  /** Non-admins are pinned to their own figures, so the people filters are hidden. */
  canFilterPeople: boolean;
}

const ROLE_OPTIONS = [
  { value: 'all', label: 'Every role' },
  { value: 'telecaller', label: 'Telecallers' },
  { value: 'sales_person', label: 'Sales' },
  { value: 'operator', label: 'Operations' },
  { value: 'welder', label: 'Welders' },
  { value: 'electrician', label: 'Electricians' },
  { value: 'admin', label: 'Admins' },
];

export const roleLabel = (role: string) =>
  ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role.replace(/_/g, ' ');

/**
 * Period first, then who.
 *
 * Today / This Month / This Year are buttons rather than dropdown entries
 * because they are the three answers people actually want and a dropdown costs
 * a click to find out what is currently selected. Custom is the fourth button
 * and reveals the two date fields under the row, so the common case never pays
 * for the rare one.
 *
 * Active filters are stated in words underneath, each one removable, with a
 * single Clear. The trap this avoids is the one the table toolbar's `filters`
 * prop exists for: a filter that is applied with no visible control, so the
 * reader is looking at a subset and believes it is everything.
 */
const PerformanceControls = ({
  value,
  onChange,
  range,
  employees,
  canFilterPeople,
}: PerformanceControlsProps) => {
  const set = (patch: Partial<PerformanceControlsValue>) => onChange({ ...value, ...patch });

  const chips: { label: string; clear: () => void }[] = [];
  if (value.role !== 'all') {
    chips.push({ label: `Role: ${roleLabel(value.role)}`, clear: () => set({ role: 'all' }) });
  }
  if (value.staff !== 'all') {
    const person = employees.find((e) => e.user_id === value.staff);
    chips.push({
      label: `Employee: ${person?.full_name ?? 'Selected'}`,
      clear: () => set({ staff: 'all' }),
    });
  }
  if (value.period === 'custom') {
    chips.push({
      label: `Period: ${range.from} → ${range.to}`,
      clear: () => set({ period: 'month' }),
    });
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-border/70 bg-card p-3 sm:p-4">
      {/* Wraps rather than overflowing: the period group plus two selects is
          wider than the content column on a laptop once the sidebar is open,
          and an Employee select running off the right edge is a filter the
          reader cannot see they have. */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Period
          </Label>
          {/* 44px targets below sm, like TablePagination and TableToolbar. */}
          <div className="flex h-11 items-center rounded-lg border border-border/70 p-0.5 sm:h-9">
            {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={value.period === key ? 'secondary' : 'ghost'}
                aria-pressed={value.period === key}
                aria-label={PERIOD_LABELS[key]}
                onClick={() => set({ period: key })}
                className="h-full flex-1 gap-1.5 whitespace-nowrap px-2 text-xs font-semibold sm:px-3"
              >
                {key === 'custom' && <CalendarRange className="h-3.5 w-3.5" />}
                {key === 'custom' ? <span className="hidden sm:inline">Custom</span> : PERIOD_LABELS[key]}
                {key === 'custom' && <span className="sm:hidden">Range</span>}
              </Button>
            ))}
          </div>
        </div>

        {canFilterPeople && (
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Role
              </Label>
              <Select value={value.role} onValueChange={(v) => set({ role: v, staff: 'all' })}>
                <SelectTrigger className="h-11 w-full text-sm sm:h-9 sm:w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Employee
              </Label>
              <Select value={value.staff} onValueChange={(v) => set({ staff: v })}>
                <SelectTrigger className="h-11 w-full text-sm sm:h-9 sm:w-[190px]">
                  <SelectValue placeholder="Everyone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.user_id} value={e.user_id}>
                      {e.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {value.period === 'custom' && (
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="perf-from" className="text-xs font-semibold">
              From
            </Label>
            <Input
              id="perf-from"
              type="date"
              value={value.customFrom}
              max={value.customTo}
              onChange={(e) => set({ customFrom: e.target.value })}
              className="h-11 text-sm sm:h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="perf-to" className="text-xs font-semibold">
              To
            </Label>
            <Input
              id="perf-to"
              type="date"
              value={value.customTo}
              min={value.customFrom}
              onChange={(e) => set({ customTo: e.target.value })}
              className="h-11 text-sm sm:h-9"
            />
          </div>
        </div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Active
          </span>
          {chips.map((chip) => (
            <Badge
              key={chip.label}
              variant="outline"
              className={cn('gap-1 py-0.5 pl-2 pr-1 text-[11px] font-medium')}
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.clear}
                aria-label={`Remove ${chip.label}`}
                className="rounded-full p-0.5 hover:bg-accent"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onChange({ ...value, period: 'month', role: 'all', staff: 'all' })}
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
};

export default PerformanceControls;
