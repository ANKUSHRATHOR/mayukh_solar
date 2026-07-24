import { ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FieldValues, UseFormReturn } from 'react-hook-form';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
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
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { cn } from '@/lib/utils';

interface FormShellProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  onSubmit: (values: T) => void | Promise<void>;
  children: ReactNode;
  submitLabel?: string;
  /** Where Cancel goes. Defaults to browser back. */
  cancelTo?: string;
  /** Form-level failure (a rejected save), shown above the actions. */
  submitError?: string | null;
  /** Extra buttons on the left of the action bar, e.g. Delete. */
  secondaryActions?: ReactNode;
  className?: string;
}

/**
 * Wraps a react-hook-form in the app's standard layout: content, a sticky
 * action bar, a form-level error slot, and unsaved-changes protection.
 *
 * Validation errors render inline against their field (via the `fields/`
 * components) rather than as a toast — the previous pattern fired a toast and
 * returned, leaving the offending field unmarked and often scrolled off-screen.
 */
function FormShell<T extends FieldValues>({
  form,
  onSubmit,
  children,
  submitLabel = 'Save',
  cancelTo,
  submitError,
  secondaryActions,
  className,
}: FormShellProps<T>) {
  const navigate = useNavigate();
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const isDirty = form.formState.isDirty;
  const isSubmitting = form.formState.isSubmitting;

  useUnsavedChangesWarning(isDirty && !isSubmitting);

  const leave = () => (cancelTo ? navigate(cancelTo) : navigate(-1));

  const handleCancel = () => {
    if (isDirty) setConfirmDiscard(true);
    else leave();
  };

  // Surface the first field error at form level too — on a long form the
  // offending input can be well outside the viewport.
  const firstFieldError = Object.values(form.formState.errors)[0] as
    | { message?: string }
    | undefined;
  const errorText = submitError ?? firstFieldError?.message;

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className={cn('space-y-5', className)} noValidate>
          {children}

          {errorText && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{errorText}</p>
            </div>
          )}

          <div className="sticky bottom-0 -mx-3 flex flex-col-reverse gap-2 border-t border-border/60 bg-background/85 px-3 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-b-2xl sm:px-0">
            <div className="flex items-center gap-2">{secondaryActions}</div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <Button type="button" variant="outline" onClick={handleCancel} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="gap-2">
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Saving…' : submitLabel}
              </Button>
            </div>
          </div>
        </form>
      </Form>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved edits on this form. Leaving now will lose them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={leave}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default FormShell;
