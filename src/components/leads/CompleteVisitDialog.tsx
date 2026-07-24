import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Crosshair,
  Loader2,
  MapPin,
  Upload,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import {
  VISIT_DOCUMENTS,
  VISIT_OUTCOMES,
  captureLocation,
  completeVisit,
  fetchLeadDocuments,
  uploadVisitDocument,
  type Coordinates,
  type SiteVisit,
} from '@/lib/visits';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visit: SiteVisit | null;
  leadId: string;
  userId: string;
  onCompleted: () => void;
}

/** Beyond this the fix is too vague to trust as a site location. */
const POOR_ACCURACY_M = 100;

/**
 * Completes a site visit: outcome, required documents, and a live GPS fix.
 *
 * The location is mandatory and captured here rather than taken from the lead,
 * because the lead's coordinates come from the DISCOM K-number lookup — that's
 * the billing address, which is regularly not where the panels go.
 */
const CompleteVisitDialog = ({
  open,
  onOpenChange,
  visit,
  leadId,
  userId,
  onCompleted,
}: Props) => {
  const { toast } = useToast();
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [onFile, setOnFile] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  // Which documents are already attached, so a re-visit doesn't ask again.
  useEffect(() => {
    if (!open) return;
    fetchLeadDocuments(leadId)
      .then((docs) =>
        setOnFile(new Set(docs.filter((d) => d.file_url).map((d) => d.document_type)))
      )
      .catch(() => setOnFile(new Set()));
  }, [open, leadId]);

  const reset = () => {
    setOutcome('');
    setNotes('');
    setCoords(null);
    setLocationError(null);
    setFiles({});
    setProgress(null);
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const getLocation = async () => {
    setLocating(true);
    setLocationError(null);
    try {
      setCoords(await captureLocation());
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : String(err));
    } finally {
      setLocating(false);
    }
  };

  // Ask for the fix as soon as the dialog opens — it is the slowest step and
  // the surveyor is standing on site.
  useEffect(() => {
    if (open && !coords && !locating && !locationError) void getLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const requiredDocs = VISIT_DOCUMENTS.filter((d) => d.required);
  const missingRequired = requiredDocs.filter(
    (d) => !files[d.type] && !onFile.has(d.type)
  );
  const canSubmit = Boolean(outcome) && Boolean(coords) && missingRequired.length === 0;

  const submit = async () => {
    if (!visit || !coords) return;
    setSubmitting(true);
    try {
      const pending = Object.entries(files);
      for (let i = 0; i < pending.length; i += 1) {
        const [type, file] = pending[i];
        setProgress(`Uploading ${i + 1} of ${pending.length}…`);
        await uploadVisitDocument(leadId, userId, type as any, file);
      }

      setProgress('Recording visit…');
      await completeVisit({
        visitId: visit.id,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracyM: coords.accuracy,
        outcome,
        notes: notes.trim() || undefined,
      });

      toast({
        title: 'Visit completed',
        description: 'Site location saved and the lead status updated.',
      });
      reset();
      onOpenChange(false);
      onCompleted();
    } catch (err) {
      toast({
        title: 'Could not complete the visit',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        // Requesting geolocation raises a browser permission prompt, which
        // moves focus out of the dialog. Radix reads that as an outside
        // interaction and closes — dumping the surveyor's staged photos and
        // notes. A stray tap on the overlay would do the same. Closing is
        // deliberate only: Cancel, or the X.
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Complete site visit</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Location */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">
              Site location<span className="ml-0.5 text-destructive">*</span>
            </Label>

            {coords ? (
              <div className="rounded-xl border border-success/30 bg-success/10 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-foreground">
                      {coords.latitude.toFixed(6)}, {coords.longitude.toFixed(6)}
                    </p>
                    {coords.accuracy !== null && (
                      <p
                        className={cn(
                          'mt-0.5 text-[11px]',
                          coords.accuracy > POOR_ACCURACY_M
                            ? 'text-warning'
                            : 'text-muted-foreground'
                        )}
                      >
                        Accurate to about {Math.round(coords.accuracy)} m
                        {coords.accuracy > POOR_ACCURACY_M &&
                          ' — move outside and recapture if you can'}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 text-xs"
                    onClick={getLocation}
                    disabled={locating}
                  >
                    Recapture
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full gap-2"
                onClick={getLocation}
                disabled={locating}
              >
                {locating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Getting your location…
                  </>
                ) : (
                  <>
                    <Crosshair className="h-4 w-4" /> Capture site location
                  </>
                )}
              </Button>
            )}

            {locationError && (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {locationError}
              </p>
            )}

            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
              This replaces the address from the K-number lookup, which is the billing
              address and is often not the installation site.
            </p>
          </div>

          {/* Outcome */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Visit outcome<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="What did you find?" />
              </SelectTrigger>
              <SelectContent>
                {VISIT_OUTCOMES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Documents */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Documents</Label>
            <ul className="divide-y divide-border/50 rounded-xl border border-border/70">
              {VISIT_DOCUMENTS.map((doc) => {
                const staged = files[doc.type];
                const already = onFile.has(doc.type);
                const done = Boolean(staged) || already;

                return (
                  <li key={doc.type} className="flex items-center gap-3 px-3 py-2.5">
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                        done
                          ? 'bg-success/15 text-success'
                          : doc.required
                            ? 'bg-warning/15 text-warning'
                            : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {done ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {doc.label}
                        {doc.required && <span className="ml-0.5 text-destructive">*</span>}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {staged
                          ? staged.name
                          : already
                            ? 'Already on file'
                            : 'Not uploaded'}
                      </p>
                    </div>

                    {staged ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() =>
                          setFiles((f) => {
                            const next = { ...f };
                            delete next[doc.type];
                            return next;
                          })
                        }
                        aria-label={`Remove ${doc.label}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 shrink-0 gap-1.5 text-xs"
                        onClick={() => fileInputs.current[doc.type]?.click()}
                      >
                        <Camera className="h-3.5 w-3.5" />
                        {already ? 'Replace' : 'Add'}
                      </Button>
                    )}

                    <input
                      ref={(el) => (fileInputs.current[doc.type] = el)}
                      type="file"
                      accept="image/*,application/pdf"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setFiles((f) => ({ ...f, [doc.type]: file }));
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Roof condition, shading, meter position, anything the operator should know…"
              className="text-sm"
            />
          </div>

          {!canSubmit && (
            <div className="rounded-xl border border-border/70 bg-muted/40 px-3 py-2.5">
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Upload className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Still needed:{' '}
                  {[
                    !coords && 'site location',
                    !outcome && 'outcome',
                    missingRequired.length > 0 &&
                      missingRequired.map((d) => d.label).join(', '),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => close(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || submitting} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {progress ?? (submitting ? 'Saving…' : 'Complete visit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CompleteVisitDialog;
