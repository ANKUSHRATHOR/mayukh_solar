import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Calendar, Loader2, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { bookVisit, updateVisit, type SiteVisit } from '@/lib/visits';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  /** The visit to edit. Absent or null books a new one. */
  visit?: SiteVisit | null;
  onSaved?: () => void;
}

const UNASSIGNED = '__none__';

/** `datetime-local` wants local wall-clock time with no zone. */
const toLocalInput = (iso: string | null | undefined) =>
  iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : '';

/**
 * Books a site visit, or edits a scheduled one — the same three fields either
 * way, so one form. The date is sent as a full ISO timestamp: the lead page used
 * to send the raw `datetime-local` string, which the database read as UTC and
 * shifted every booking by five and a half hours.
 */
const VisitFormDialog = ({ open, onOpenChange, leadId, visit, onSaved }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = Boolean(visit);

  const [when, setWhen] = useState('');
  const [assignee, setAssignee] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Re-seed on every open, so a cancelled edit never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setWhen(toLocalInput(visit?.scheduled_for ?? visit?.visit_date));
    setAssignee(visit?.assigned_to_user_id ?? '');
    setNotes(visit?.visit_notes ?? '');
  }, [open, visit]);

  const assigneesQuery = useQuery({
    queryKey: ['assignable-sales-persons'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_assignable_sales_persons');
      if (error) throw new Error(error.message);
      return (data ?? []) as { user_id: string; full_name: string; mobile: string }[];
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const assignees = assigneesQuery.data ?? [];

  const handleSave = async () => {
    if (!when) {
      toast({ title: 'Date required', description: 'Pick the visit date and time.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        scheduledFor: new Date(when).toISOString(),
        assignedToUserId: assignee || null,
        notes: notes.trim() || undefined,
      };
      if (visit) await updateVisit({ visitId: visit.id, ...payload });
      else await bookVisit({ leadId, ...payload });

      toast({
        title: isEdit ? 'Visit updated' : 'Visit booked',
        description: format(new Date(when), 'dd MMM yyyy, h:mm a'),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lead-visits', leadId] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
        visit ? queryClient.invalidateQueries({ queryKey: ['visit', visit.id] }) : Promise.resolve(),
      ]);
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast({
        title: isEdit ? 'Could not update the visit' : 'Could not book the visit',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // An assignee who has since left the assignable list still needs an option,
  // or the select renders blank and saving would silently unassign them.
  const assigneeMissing = assignee && !assignees.some((a) => a.user_id === assignee);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            {isEdit ? <Pencil className="h-4 w-4 text-primary" /> : <Calendar className="h-4 w-4 text-primary" />}
            {isEdit ? 'Edit site visit' : 'Book site visit'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Change the date, who is going, or the instructions.'
              : 'Schedule a visit and choose who goes. A lead can have any number of visits.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="visit-when" className="text-xs font-semibold">Date &amp; time *</Label>
            <Input
              id="visit-when"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="h-11 text-sm sm:h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Assigned to</Label>
            <Select value={assignee || UNASSIGNED} onValueChange={(v) => setAssignee(v === UNASSIGNED ? '' : v)}>
              <SelectTrigger className="h-11 text-sm sm:h-10">
                <SelectValue placeholder="Leave unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned (open for claim)</SelectItem>
                {assigneeMissing && <SelectItem value={assignee}>Current assignee</SelectItem>}
                {assignees.map((a) => (
                  <SelectItem key={a.user_id} value={a.user_id}>
                    {a.full_name} — {a.mobile}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="visit-notes" className="text-xs font-semibold">Instructions / notes</Label>
            <Textarea
              id="visit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Directions or specific customer requests…"
              rows={3}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || !when}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Book visit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default VisitFormDialog;
