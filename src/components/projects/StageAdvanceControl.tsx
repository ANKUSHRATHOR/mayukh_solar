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
import { ArrowRight, Check, Loader2, Lock, MoreHorizontal, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stageBlockers, type StageDefinition, type StageGateFacts } from '@/lib/projectStages';
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
 * Moving a project along its pipeline.
 *
 * Lives at the foot of the Pipeline card rather than in a card of its own: that
 * card already answers "where is this project", and "move it on" is the same
 * question's other half. A separate "Update stage" panel would restate the
 * stage list a second time to hang one button off it.
 *
 * The database decides. `enforce_project_stage_gate` refuses the UPDATE if a
 * requirement is outstanding, so this never grants anything — `stageBlockers`
 * only lets the button explain itself before it is pressed instead of turning a
 * refusal into a toast. An admin bypasses the trigger, so for them the blockers
 * are shown as a warning on a live button rather than as a disabled one.
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
  const blockers = next ? stageBlockers(next.stage, facts) : [];
  const blocked = blockers.length > 0;

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
    } catch (error: any) {
      toast({
        title: 'Could not move this project',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
      setConfirming(null);
    }
  };

  // Off-pipeline legacy rows get the picker only: there is no meaningful "next".
  const showAdvance = Boolean(next);

  return (
    <>
      <div className="space-y-2 border-t border-border/70 pt-3">
        {showAdvance && next && (
          <Button
            size="sm"
            className="h-9 w-full gap-2"
            disabled={blocked && !isAdmin ? true : saving !== null}
            onClick={() => (isAdmin && blocked ? setConfirming(next) : move(next))}
          >
            {saving === next.stage ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : blocked && !isAdmin ? (
              <Lock className="h-4 w-4" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Move to {next.label}
          </Button>
        )}

        {showAdvance && blocked && (
          // Named, not merely disabled: "why can't I press this" is the whole
          // question a greyed-out button raises.
          <ul className="space-y-1">
            {blockers.map((reason) => (
              <li
                key={reason}
                className={cn(
                  'flex gap-1.5 text-[11px] leading-snug',
                  isAdmin ? 'text-warning' : 'text-muted-foreground',
                )}
              >
                <span aria-hidden className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-current" />
                {reason}
              </li>
            ))}
          </ul>
        )}

        {!showAdvance && currentIndex >= 0 && (
          <p className="text-[11px] text-muted-foreground">
            This is the final stage of the pipeline.
          </p>
        )}

        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-full gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
                Set a different stage
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-60 overflow-y-auto">
              <DropdownMenuLabel className="text-[11px]">
                Corrects a mistake — skips the checklist
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {pipeline.map((stage, index) => (
                <DropdownMenuItem
                  key={stage.stage}
                  disabled={index === currentIndex || saving !== null}
                  // No preventDefault: the menu should close as the dialog opens,
                  // rather than sitting behind it.
                  onSelect={() => {
                    if (index === currentIndex) return;
                    setConfirming(stage);
                  }}
                  className="gap-2 text-xs"
                >
                  <span className="w-4 shrink-0 text-muted-foreground">
                    {index === currentIndex ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                  <span className="flex-1 truncate">{stage.label}</span>
                  <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                    {index + 1}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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
            <AlertDialogCancel disabled={saving !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving !== null}
              onClick={(event) => {
                event.preventDefault();
                if (confirming) void move(confirming);
              }}
            >
              {saving ? 'Moving…' : 'Move anyway'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
