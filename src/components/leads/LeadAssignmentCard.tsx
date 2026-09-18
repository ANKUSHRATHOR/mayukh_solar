import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Headset, Loader2, UserRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  assignLead,
  canAssignSlot,
  fetchAssignableStaff,
  SLOT_LABEL,
  type AssignmentSlot,
} from '@/lib/leadAssignment';

interface Props {
  leadId: string;
  telecallerId: string | null;
  salesPersonId: string | null;
  /** Reload the lead once an assignment changes. */
  onChanged: () => void;
}

const UNASSIGNED = '__none__';

/**
 * The lead's two owners, side by side.
 *
 * Both are set independently: a telecaller keeps the lead while a sales rep
 * visits it, which the single old field made impossible.
 */
const LeadAssignmentCard = ({ leadId, telecallerId, salesPersonId, onChanged }: Props) => {
  const { role } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState<AssignmentSlot | null>(null);

  const staffQuery = useQuery({
    queryKey: ['assignable-staff'],
    queryFn: fetchAssignableStaff,
    staleTime: 5 * 60 * 1000,
  });
  const staff = staffQuery.data ?? [];

  const save = async (slot: AssignmentSlot, value: string) => {
    setSaving(slot);
    try {
      await assignLead(leadId, slot, value === UNASSIGNED ? null : value);
      toast({
        title: value === UNASSIGNED ? `${SLOT_LABEL[slot]} cleared` : `${SLOT_LABEL[slot]} updated`,
      });
      onChanged();
    } catch (err) {
      toast({
        title: 'Could not change the assignment',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
    }
  };

  const slots: { slot: AssignmentSlot; current: string | null; icon: typeof Headset; roleFilter: string }[] = [
    { slot: 'telecaller', current: telecallerId, icon: Headset, roleFilter: 'telecaller' },
    { slot: 'sales_person', current: salesPersonId, icon: UserRound, roleFilter: 'sales_person' },
  ];

  const nameOf = (userId: string | null) =>
    userId ? staff.find((s) => s.user_id === userId)?.full_name ?? 'Unknown staff' : null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {slots.map(({ slot, current, icon: Icon, roleFilter }) => {
        const editable = canAssignSlot(role, slot);
        const options = staff.filter((s) => s.role === roleFilter);
        const currentMissing = current && !options.some((o) => o.user_id === current);

        return (
          <div key={slot} className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Icon className="h-3.5 w-3.5" /> {SLOT_LABEL[slot]}
            </p>

            {editable ? (
              <div className="flex items-center gap-2">
                <Select
                  value={current ?? UNASSIGNED}
                  onValueChange={(v) => void save(slot, v)}
                  disabled={saving !== null || staffQuery.isLoading}
                >
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue placeholder="Not assigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Not assigned</SelectItem>
                    {/* Someone deactivated since the assignment still needs an
                        option, or the trigger renders blank. */}
                    {currentMissing && <SelectItem value={current}>{nameOf(current)}</SelectItem>}
                    {options.map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>
                        {s.full_name}
                        {s.mobile ? ` — ${s.mobile}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {saving === slot && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
              </div>
            ) : (
              <p className={`text-sm font-semibold ${current ? 'text-foreground' : 'italic text-muted-foreground'}`}>
                {nameOf(current) ?? 'Not assigned'}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default LeadAssignmentCard;
