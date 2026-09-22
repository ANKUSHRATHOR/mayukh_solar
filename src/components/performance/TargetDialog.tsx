import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { TARGET_METRICS, type TargetMetric } from '@/lib/performance';
import { saveTarget } from '@/lib/performanceData';
import type { PerformanceRow } from '@/lib/performanceData';

interface TargetDialogProps {
  row: PerformanceRow | null;
  /** The month the period sits in, as `yyyy-MM`. */
  defaultMonth: string;
  onOpenChange: (open: boolean) => void;
}

/**
 * Setting a person's monthly number.
 *
 * Per month, not "current target": a target edited in place would silently
 * rewrite every past period's achievement percentage, and a manager reviewing
 * last quarter would be reading this quarter's bar. The metric is fixed by role
 * so target and achievement can never end up in different units.
 */
const TargetDialog = ({ row, defaultMonth, onOpenChange }: TargetDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(defaultMonth);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (row) {
      setMonth(defaultMonth);
      // Pre-filled with the pro-rated figure already in force, rounded — a
      // starting point, not a claim about what was stored for the month.
      setValue(row.target_value === null ? '' : String(Math.round(row.target_value)));
    }
  }, [row, defaultMonth]);

  const metric = (row?.target_metric ?? 'projects_completed') as TargetMetric;

  const save = useMutation({
    mutationFn: async () => {
      if (!row) return;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error('Enter a target of zero or more.');
      }
      await saveTarget({
        staffUserId: row.user_id,
        month,
        metric,
        value: parsed,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['performance-overview'] });
      toast({ title: 'Target saved', description: `${row?.full_name} — ${month}` });
      onOpenChange(false);
    },
    onError: (error: Error) =>
      toast({ title: 'Could not save the target', description: error.message, variant: 'destructive' }),
  });

  return (
    <Dialog open={Boolean(row)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Monthly target</DialogTitle>
          <DialogDescription>
            {row?.full_name} is measured on {TARGET_METRICS[metric]?.label.toLowerCase()}. A period
            shorter than a month is compared against a pro-rated share of this number.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="target-month">Month</Label>
            <Input
              id="target-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-11 sm:h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="target-value">
              Target ({TARGET_METRICS[metric]?.unit === 'currency' ? '₹' : 'count'})
            </Label>
            <Input
              id="target-value"
              type="number"
              min={0}
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
              className="h-11 sm:h-10"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending || value === ''}>
            {save.isPending ? 'Saving…' : 'Save target'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TargetDialog;
