import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { ArrowRight, ChevronDown, Loader2, Lock, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stageBlockers, stageNumber, type StageDefinition, type StageGateFacts } from '@/lib/projectStages';
import { retryQuery } from '@/lib/retry';

interface Props {
  projectId: string;
  /** This project's applicable pipeline, already filtered by payment type. */
  pipeline: StageDefinition[];
  /** Position in that pipeline; -1 for a legacy stage that is off-pipeline. */
  currentIndex: number;
  facts: StageGateFacts | null | undefined;
  /** Mirrors the projects UPDATE policy — who may move this project at all. */
  canEdit: boolean;
  /** Admins bypass the server's stage gate, so the UI must not hard-stop them. */
  isAdmin: boolean;
  onChanged: () => void;
}

/**
 * Moving a project along its pipeline: a split button — advance one step, or
 * open the picker and set any stage.
 *
 * Sits in the pipeline bar, on the sidebar's dark ground, so it is styled from
 * the `sidebar-*` tokens rather than the app ones; `bg-primary` is the same
 * solar accent in both scales, so the action still reads as the page's primary.
 *
 * The database decides. `enforce_project_stage_gate` refuses the UPDATE if a
 * requirement is outstanding, so this never grants anything — `stageBlockers`
 * only lets the control explain itself before it is pressed instead of turning
 * a refusal into a toast. An admin bypasses the trigger, so for them an unmet
 * checklist is a confirmation naming what is missing, not a dead button.
 */
export default function StageAdvanceControl({
  projectId,
  pipeline,
  currentIndex,
  facts,
  canEdit,
  isAdmin,
  onChanged,
}: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<StageDefinition | null>(null);

  if (!canEdit) return null;

  const next = currentIndex >= 0 ? pipeline[currentIndex + 1] : undefined;
  const nextBlockers = next ? stageBlockers(next.stage, facts) : [];
  const blocked = nextBlockers.length > 0;

  const move = async (stage: StageDefinition) => {
    setSaving(stage.stage);
    try {
      // Safe to retry: the update sets one specific stage rather than stepping
      // relative to the current one, so applying it twice is applying it once.
      const { error } = await retryQuery(() =>
        supabase
          .from('projects')
          .update({ status: stage.stage as never })
          .eq('id', projectId),
      );
      // The stage gate raises rather than returning a row count, so the message
      // here is the database's own explanation of what is missing.
      if (error) throw error;

      toast({ title: `Moved to ${stage.label}` });
      onChanged();
    } catch (error) {
      toast({
        title: 'Could not move this project',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
      setConfirming(null);
    }
  };

  const busy = saving !== null;
  // A legacy row sitting off-pipeline has no meaningful "next", so it gets the
  // picker alone — which is also the only way back onto the pipeline.
  const canAdvance = Boolean(next);

  return (
    <>
      <div className="flex shrink-0 items-stretch">
        {canAdvance && next && (
          <Button
            size="sm"
            className={cn(
              'h-8 gap-1.5 rounded-r-none px-3 text-xs font-bold',
              blocked && !isAdmin && 'opacity-60',
            )}
            disabled={blocked && !isAdmin ? true : busy}
            onClick={() => (isAdmin && blocked ? setConfirming(next) : move(next))}
            // The bar no longer prints the blockers, so a control that refuses
            // still has to be able to say why — on hover here, and in full in
            // the confirmation an admin gets.
            title={
              blocked
                ? `Blocked: ${nextBlockers.join(' ')}`
                : `Move to ${next.label}`
            }
          >
            {saving === next.stage ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : blocked && !isAdmin ? (
              <Lock className="h-3.5 w-3.5" />
            ) : null}
            Advance
            {!busy && !(blocked && !isAdmin) && <ArrowRight className="h-3.5 w-3.5" />}
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              disabled={busy}
              aria-label="Set a different stage"
              className={cn(
                'h-8 w-8 p-0',
                canAdvance
                  ? 'rounded-l-none border-l border-primary-foreground/25'
                  : 'rounded-md px-3',
              )}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-[22rem] w-64 overflow-y-auto">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Set a different stage
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {pipeline.map((stage, index) => {
              const isCurrent = index === currentIndex;
              const done = currentIndex >= 0 && index < currentIndex;
              return (
                <DropdownMenuItem
                  key={stage.stage}
                  disabled={isCurrent || busy}
                  // No preventDefault: the menu should close as the dialog opens,
                  // rather than sitting behind it.
                  onSelect={() => {
                    if (isCurrent) return;
                    setConfirming(stage);
                  }}
                  className={cn(
                    'gap-2 text-sm',
                    isCurrent && 'bg-accent font-bold text-foreground opacity-100',
                  )}
                >
                  <span
                    className={cn(
                      'shrink-0 tabular-nums',
                      isCurrent ? 'text-foreground' : done ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {stageNumber(index)}
                  </span>
                  <span className="flex-1 truncate">{stage.label}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-warning" />
              Move to {confirming?.label}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {confirming && stageBlockers(confirming.stage, facts).length > 0
                    ? 'This stage is not ready. As an admin you can move it anyway, but the checklist is still outstanding:'
                    : 'This sets the stage directly rather than advancing one step.'}
                </p>
                {confirming && stageBlockers(confirming.stage, facts).length > 0 && (
                  <ul className="space-y-1 text-xs">
                    {stageBlockers(confirming.stage, facts).map((reason) => (
                      <li key={reason}>• {reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                if (confirming) void move(confirming);
              }}
            >
              {busy ? 'Moving…' : 'Move anyway'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
