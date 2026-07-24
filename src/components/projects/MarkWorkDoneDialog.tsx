import { useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Loader2, Upload, X } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import { estimateBlur } from '@/lib/capture';
import {
  TRADE_PHOTO,
  markTradeWorkDone,
  saveSerialNumbers,
  uploadWorkPhoto,
  type Trade,
  type TradeJob,
} from '@/lib/projectWork';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: TradeJob | null;
  trade: Trade;
  userId: string;
  onCompleted: () => void;
}

/** Below this, the Laplacian variance heuristic says the photo is likely unusable. */
const BLUR_THRESHOLD = 25;

/**
 * Marks a trade's work complete. The plant photo is mandatory — the submit
 * button stays disabled without one, and the server rejects the call anyway if
 * the document is missing.
 *
 * The electrician flow also captures serial numbers, upserted so a retry after
 * a network failure updates rather than duplicating.
 */
const MarkWorkDoneDialog = ({
  open,
  onOpenChange,
  job,
  trade,
  userId,
  onCompleted,
}: Props) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blurry, setBlurry] = useState(false);
  const [panelSerial, setPanelSerial] = useState('');
  const [inverterSerial, setInverterSerial] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const photoSpec = TRADE_PHOTO[trade];
  const needsSerials = trade === 'electrician';
  // A photo already on file satisfies the requirement without re-uploading.
  const photoSatisfied = Boolean(photo) || Boolean(job?.hasPhoto);
  const serialsSatisfied =
    !needsSerials || (panelSerial.trim().length > 0 && inverterSerial.trim().length > 0);

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPhoto(null);
    setPreviewUrl(null);
    setBlurry(false);
    setPanelSerial('');
    setInverterSerial('');
  };

  const close = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'That file is not an image',
        description: 'Take or choose a photo of the plant.',
        variant: 'destructive',
      });
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPhoto(file);
    setPreviewUrl(URL.createObjectURL(file));

    // Advisory only — a warning, never a block. A genuinely needed photo taken
    // in poor light shouldn't be rejected by a heuristic.
    const sharpness = await estimateBlur(file);
    setBlurry(sharpness < BLUR_THRESHOLD);
  };

  const submit = async () => {
    if (!job) return;
    setSubmitting(true);
    try {
      // Order matters: the photo must land before the completion call, because
      // the server refuses to mark work done without it.
      if (photo) {
        await uploadWorkPhoto(job.id, userId, photoSpec.documentType, photo);
      }
      if (needsSerials) {
        await saveSerialNumbers(job.id, userId, panelSerial, inverterSerial);
      }
      await markTradeWorkDone(job.id, trade);

      toast({
        title: 'Work marked as done',
        description: 'The operator can now review and advance the project.',
      });
      reset();
      onOpenChange(false);
      onCompleted();
    } catch (err) {
      toast({
        title: 'Could not mark the work done',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {trade === 'welder' ? 'Mark structure work done' : 'Mark wiring done'}
          </DialogTitle>
          <DialogDescription>
            A photo of the finished plant is required before this can be submitted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold">
              {photoSpec.label}
              <span className="ml-0.5 text-destructive">*</span>
            </Label>

            {job?.hasPhoto && !photo && (
              <div className="flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <p className="text-xs text-foreground">
                  A photo is already on file for this project. Upload again only if you
                  need to replace it.
                </p>
              </div>
            )}

            {previewUrl ? (
              <div className="space-y-2">
                <div className="relative overflow-hidden rounded-xl border border-border">
                  <img src={previewUrl} alt="Plant" className="max-h-56 w-full object-cover" />
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute right-2 top-2 h-8 w-8"
                    onClick={reset}
                    aria-label="Remove photo"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {blurry && (
                  <p className="flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    This photo looks blurry. Retake it if the plant isn&rsquo;t clearly
                    visible.
                  </p>
                )}
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                // Comfortably large tap target for a gloved hand on a phone.
                className="h-24 w-full flex-col gap-2 border-dashed"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium">Take or choose a photo</span>
              </Button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          {needsSerials && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Panel serial number<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  value={panelSerial}
                  onChange={(e) => setPanelSerial(e.target.value)}
                  placeholder="As printed on the panel"
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Inverter serial number<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  value={inverterSerial}
                  onChange={(e) => setInverterSerial(e.target.value)}
                  placeholder="As printed on the inverter"
                  className="h-11"
                />
              </div>
            </div>
          )}

          {!photoSatisfied && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Upload className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Add the photo to enable submission.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => close(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !photoSatisfied || !serialsSatisfied}
            className="gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Submitting…' : 'Mark done'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MarkWorkDoneDialog;
