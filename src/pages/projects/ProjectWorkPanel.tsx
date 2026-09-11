import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertTriangle, Camera, CheckCircle2, Clock, Loader2, Pencil, UserX, Wrench, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import SectionCard from '@/components/common/SectionCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  assignTrade,
  canAssignTrades,
  fetchAssignableTradeStaff,
  type Trade,
} from '@/lib/projectWork';
import type { ProjectRow, StageRequirements } from '@/lib/projects';

/** Radix Select cannot take value="" — this stands in for "nobody". */
const UNASSIGNED = '__unassigned__';

interface Props {
  project: ProjectRow;
  requirements: StageRequirements | null;
}

interface TradeState {
  role: 'Welder' | 'Electrician';
  trade: Trade;
  icon: typeof Wrench;
  assignedId: string | null;
  doneAt: string | null;
  photoUploaded: boolean;
  photoLabel: string;
}

/**
 * Installation sub-steps.
 *
 * Wiring and structure work are no longer top-level pipeline stages, so this
 * panel is where their state lives: who is assigned, whether the work is done,
 * and whether the mandatory plant photo has been supplied. A trade cannot be
 * considered complete without its photo — the same rule the stage gate enforces
 * in `can_advance_project`.
 */
const ProjectWorkPanel = ({ project, requirements }: Props) => {
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canAssign = canAssignTrades(role);
  // Assignment is an explicit edit → save, not a dropdown that writes the
  // moment it changes: a stray tap on a Select would otherwise reassign
  // somebody's job and fire a notification at them.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<Trade, string | null>>({
    welder: null,
    electrician: null,
  });

  const staffIds = [project.assigned_welder_id, project.assigned_electrician_id].filter(
    Boolean
  ) as string[];

  const { data: staff } = useQuery({
    queryKey: ['project-trades', project.id, staffIds],
    enabled: staffIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('user_id, full_name, mobile')
        .in('user_id', staffIds);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const nameFor = (userId: string | null) =>
    staff?.find((s) => s.user_id === userId) ?? null;

  // The roster barely changes, and this is two extra queries on a page that is
  // already loading several — cache it hard.
  const welderOptions = useQuery({
    queryKey: ['assignable-trade-staff', 'welder'],
    enabled: canAssign,
    staleTime: 5 * 60_000,
    queryFn: () => fetchAssignableTradeStaff('welder'),
  });
  const electricianOptions = useQuery({
    queryKey: ['assignable-trade-staff', 'electrician'],
    enabled: canAssign,
    staleTime: 5 * 60_000,
    queryFn: () => fetchAssignableTradeStaff('electrician'),
  });

  const startEditing = () => {
    setDraft({
      welder: project.assigned_welder_id,
      electrician: project.assigned_electrician_id,
    });
    setEditing(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      // Only the trades the user actually changed are written, so saving
      // without touching a row cannot re-notify the person already on it.
      const changes: { trade: Trade; userId: string | null }[] = [];
      if (draft.welder !== project.assigned_welder_id)
        changes.push({ trade: 'welder', userId: draft.welder });
      if (draft.electrician !== project.assigned_electrician_id)
        changes.push({ trade: 'electrician', userId: draft.electrician });
      for (const change of changes) {
        await assignTrade(project.id, change.trade, change.userId);
      }
      return changes.length;
    },
    onSuccess: (changed) => {
      // project-requirements carries welder_assigned / electrician_assigned,
      // which the stage checklist reads — stale there would tell an operator
      // the gate is still closed after they just satisfied it.
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['project-requirements', project.id] });
      queryClient.invalidateQueries({ queryKey: ['project-trades', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setEditing(false);
      toast({
        title: changed === 0 ? 'No changes' : 'Assignment saved',
        description: changed > 0 ? 'Anyone newly assigned has been notified.' : undefined,
      });
    },
    onError: (err) =>
      toast({
        title: 'Could not save the assignment',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      }),
  });

  const dirty =
    editing &&
    (draft.welder !== project.assigned_welder_id ||
      draft.electrician !== project.assigned_electrician_id);

  const trades: TradeState[] = [
    {
      role: 'Welder',
      trade: 'welder',
      icon: Wrench,
      assignedId: project.assigned_welder_id,
      doneAt: project.welder_work_done_at,
      photoUploaded: requirements?.structure_photo_uploaded ?? false,
      photoLabel: 'Structure photo',
    },
    {
      role: 'Electrician',
      trade: 'electrician',
      icon: Zap,
      assignedId: project.assigned_electrician_id,
      doneAt: project.electrician_work_done_at,
      photoUploaded: requirements?.wiring_photo_uploaded ?? false,
      photoLabel: 'Wiring photo',
    },
  ];

  const bothAssigned = trades.every((t) => t.assignedId);
  const bothComplete = trades.every((t) => t.doneAt && t.photoUploaded);

  const statusBadge = bothComplete ? (
    <Badge className="border-transparent bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase text-success">
      Complete
    </Badge>
  ) : bothAssigned ? (
    <Badge className="border-transparent bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase text-warning">
      Work pending
    </Badge>
  ) : (
    <Badge className="border-transparent bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
      Not assigned
    </Badge>
  );

  return (
    <SectionCard
      title="Installation work"
      icon={Wrench}
      actions={
        <div className="flex items-center gap-2">
          {canAssign &&
            (editing ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setEditing(false)}
                  disabled={save.isPending}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-xs font-semibold"
                  onClick={() => save.mutate()}
                  disabled={save.isPending || !dirty}
                >
                  {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs font-semibold"
                onClick={startEditing}
                aria-label={bothAssigned ? 'Reassign trade staff' : 'Assign trade staff'}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {bothAssigned ? 'Reassign' : 'Assign'}
                </span>
              </Button>
            ))}
          {statusBadge}
        </div>
      }
      contentClassName="p-0"
    >
      <ul className="divide-y divide-border/50">
        {trades.map((trade) => {
          const person = nameFor(trade.assignedId);
          const Icon = trade.icon;
          // Work marked done but no photo is an incomplete submission, not a
          // completed one — show it as blocked rather than green.
          const missingPhoto = Boolean(trade.doneAt) && !trade.photoUploaded;
          const complete = Boolean(trade.doneAt) && trade.photoUploaded;

          return (
            <li key={trade.role} className="flex items-start gap-3 px-4 py-3.5">
              <span
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                  complete
                    ? 'bg-success/15 text-success'
                    : missingPhoto
                      ? 'bg-destructive/15 text-destructive'
                      : trade.assignedId
                        ? 'bg-warning/15 text-warning'
                        : 'bg-muted text-muted-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{trade.role}</span>
                  {complete && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Done
                    </span>
                  )}
                  {missingPhoto && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" /> Photo missing
                    </span>
                  )}
                  {!trade.doneAt && trade.assignedId && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning">
                      <Clock className="h-3.5 w-3.5" /> Pending
                    </span>
                  )}
                </div>

                {person ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {person.full_name}
                    {person.mobile && (
                      <>
                        {' · '}
                        <a
                          href={`tel:${person.mobile}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {person.mobile}
                        </a>
                      </>
                    )}
                  </p>
                ) : (
                  !editing && (
                    <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <UserX className="h-3.5 w-3.5" /> Nobody assigned yet
                    </p>
                  )
                )}

                {/* Assignment used to mean leaving for the operator page and
                    driving a status transition. It happens here now. */}
                {editing && (
                  <div className="mt-2 flex items-center gap-2">
                    <Select
                      value={draft[trade.trade] ?? UNASSIGNED}
                      disabled={save.isPending}
                      onValueChange={(value) =>
                        setDraft((d) => ({
                          ...d,
                          [trade.trade]: value === UNASSIGNED ? null : value,
                        }))
                      }
                    >
                      <SelectTrigger
                        className="h-9 max-w-[240px] text-xs"
                        aria-label={`Assign ${trade.role.toLowerCase()}`}
                      >
                        <SelectValue placeholder={`Choose a ${trade.role.toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>— Unassigned —</SelectItem>
                        {(trade.trade === 'welder'
                          ? welderOptions.data ?? []
                          : electricianOptions.data ?? []
                        ).map((person) => (
                          <SelectItem key={person.user_id} value={person.user_id}>
                            {person.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Camera className="h-3.5 w-3.5" />
                  {trade.photoLabel}:{' '}
                  <span
                    className={
                      trade.photoUploaded ? 'font-semibold text-success' : 'text-muted-foreground'
                    }
                  >
                    {trade.photoUploaded ? 'uploaded' : 'not uploaded'}
                  </span>
                </p>

                {trade.doneAt && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Marked done {format(new Date(trade.doneAt), 'dd MMM yyyy, h:mm a')}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {!bothComplete && (
        <p className="border-t border-border/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          Installation cannot be marked complete until both trades have finished and
          uploaded their plant photos.
        </p>
      )}
    </SectionCard>
  );
};

export default ProjectWorkPanel;
