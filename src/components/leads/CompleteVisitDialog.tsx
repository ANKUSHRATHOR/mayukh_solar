import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Crosshair,
  Loader2,
  MapPin,
  Upload,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
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
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { documentLabels, type DocumentType } from '@/lib/documents';
import {
  VISIT_DOCUMENTS,
  VISIT_OUTCOMES,
  bookVisit,
  captureLocation,
  completeVisit,
  findOutcome,
  uploadVisitDocument,
  type Coordinates,
  type SiteVisit,
} from '@/lib/visits';

interface LeadDocumentRow {
  document_type: DocumentType;
  file_url: string | null;
}

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
 * Updates a booked visit's status: an outcome and, for outcomes that put
 * someone on site, a live GPS fix.
 *
 * The location is captured here rather than taken from the lead, because the
 * lead's coordinates come from the DISCOM K-number lookup — that's the
 * billing address, which is regularly not where the panels go. It's only
 * mandatory for outcomes where someone actually went on site; see
 * `VisitOutcome.skipsLocation`.
 *
 * Documents upload the same way as the lead's Documents tab
 * (`LeadDocumentsPanel`) — same `uploadVisitDocument` call, same
 * `lead-documents` query cache — except each one uploads the moment a file is
 * picked rather than being staged until the whole form submits. That keeps a
 * slow or failed upload from being tangled up with recording the visit
 * outcome itself.
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
  const queryClient = useQueryClient();
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const [outcome, setOutcome] = useState('');
  const [rescheduleFor, setRescheduleFor] = useState('');
  const [notes, setNotes] = useState('');
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  // Which document type an in-flight upload belongs to, for a row-level spinner.
  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null);

  const docsQuery = useQuery({
    queryKey: ['lead-documents', leadId],
    enabled: open,
    queryFn: async (): Promise<LeadDocumentRow[]> => {
      const { data, error } = await supabase
        .from('documents')
        .select('document_type, file_url')
        .eq('lead_id', leadId);
      if (error) throw new Error(error.message);
      return (data as LeadDocumentRow[]) ?? [];
    },
  });
  const onFile = new Set(
    (docsQuery.data ?? []).filter((d) => d.file_url).map((d) => d.document_type)
  );

  const uploadDoc = async (type: DocumentType, file: File) => {
    setUploadingType(type);
    try {
      await uploadVisitDocument(leadId, userId, type, file);
      toast({ title: 'Document saved', description: documentLabels[type] });
      queryClient.invalidateQueries({ queryKey: ['lead-documents', leadId] });
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setUploadingType(null);
    }
  };

  const reset = () => {
    setOutcome('');
    setRescheduleFor('');
    setNotes('');
    setCoords(null);
    setLocationError(null);
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

  const selectedOutcome = findOutcome(outcome);
  const needsNewDate = selectedOutcome?.reschedules ?? false;
  // A call that never connected, or a decline over the phone, never puts
  // anyone on site — don't block on a GPS fix for those.
  const locationOptional = selectedOutcome?.skipsLocation ?? false;

  const canSubmit =
    Boolean(outcome) &&
    (locationOptional || Boolean(coords)) &&
    (!needsNewDate || Boolean(rescheduleFor));

  const submit = async () => {
    if (!visit) return;
    setSubmitting(true);
    try {
      setProgress('Recording visit…');
      await completeVisit({
        visitId: visit.id,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        accuracyM: coords?.accuracy ?? null,
        outcome,
        notes: notes.trim() || undefined,
      });

      // Closing a visit as "change the date" without booking the replacement
      // would drop the lead off the open-visits list entirely.
      if (needsNewDate && rescheduleFor) {
        setProgress('Booking the new date…');
        await bookVisit({
          leadId,
          scheduledFor: new Date(rescheduleFor).toISOString(),
          assignedToUserId: visit.assigned_to_user_id ?? visit.staff_id ?? userId,
          notes: notes.trim() || undefined,
        });
      }

      toast({
        title: needsNewDate ? 'Visit rescheduled' : 'Status updated',
        description: needsNewDate
          ? 'The original visit was closed and a new one booked.'
          : coords
            ? 'Site location saved and the lead status updated.'
            : 'The lead status was updated.',
      });
      reset();
      onOpenChange(false);
      onCompleted();
    } catch (err) {
      toast({
        title: 'Could not update the status',
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
        // interaction and closes — dumping the surveyor's notes. A stray tap
        // on the overlay would do the same. Closing is deliberate only:
        // Cancel, or the X.
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Update status</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Location */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">
              Site location
              {locationOptional ? (
                <span className="ml-1 font-normal text-muted-foreground">
                  (not needed for this outcome)
                </span>
              ) : (
                <span className="ml-0.5 text-destructive">*</span>
              )}
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

          {/* New date, when the outcome is a reschedule */}
          {needsNewDate && (
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-for" className="text-xs font-semibold">
                New visit date<span className="ml-0.5 text-destructive">*</span>
              </Label>
              <Input
                id="reschedule-for"
                type="datetime-local"
                className="h-11"
                value={rescheduleFor}
                onChange={(e) => setRescheduleFor(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                This visit closes and a new one is booked for the date you pick, so the
                lead stays on the open visits list.
              </p>
            </div>
          )}

          {/* Documents */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Documents</Label>
            <ul className="divide-y divide-border/50 rounded-xl border border-border/70">
              {VISIT_DOCUMENTS.map((doc) => {
                const done = onFile.has(doc.type);
                const busy = uploadingType === doc.type;

                return (
                  <li key={doc.type} className="flex items-center gap-3 px-3 py-2.5">
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                        done ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {done ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{doc.label}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {busy ? 'Uploading…' : done ? 'On file' : 'Not uploaded'}
                      </p>
                    </div>

                    {busy ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 shrink-0 gap-1.5 text-xs"
                        onClick={() => fileInputs.current[doc.type]?.click()}
                      >
                        <Camera className="h-3.5 w-3.5" />
                        {done ? 'Replace' : 'Add'}
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
                        e.target.value = '';
                        if (file) void uploadDoc(doc.type, file);
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
                    !coords && !locationOptional && 'site location',
                    !outcome && 'outcome',
                    needsNewDate && !rescheduleFor && 'new visit date',
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
            {progress ?? (submitting ? 'Saving…' : 'Update Status')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CompleteVisitDialog;
