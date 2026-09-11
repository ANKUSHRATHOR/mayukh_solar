import { useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ErrorState from '@/components/common/ErrorState';
import {
  downloadFile,
  isPreviewable,
  resolveFile,
  revokeFileUrl,
  type FileHandle,
  type ResolvedFile,
} from '@/lib/fileStore';

interface Props {
  handle: FileHandle | null;
  /** Human name for the document, used as the title and the download name. */
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description?: string;
}

/**
 * Inline preview for a stored document.
 *
 * Every screen used to "preview" by opening a signed URL in a new tab, which
 * on a phone means leaving the app and losing the record you were reading.
 * Images render here, PDFs render in an iframe, and anything else offers to
 * open or save instead of pretending it can be shown.
 *
 * Drive files are private, so the URL is an object URL over bytes fetched
 * through the proxy rather than a link Google would serve. It has to be
 * revoked, or every preview leaks the file's worth of memory for the life of
 * the tab.
 */
const DocumentPreviewDialog = ({ handle, label, open, onOpenChange, description }: Props) => {
  const [file, setFile] = useState<ResolvedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !handle?.ref) {
      setFile(null);
      setError(null);
      return;
    }

    // The dialog can close, or the document change, while a fetch is running;
    // a late result must not overwrite the current one or leak its blob.
    let active = true;
    let created: string | null = null;

    setError(null);
    setFile(null);

    resolveFile(handle)
      .then((resolved) => {
        if (!active) {
          revokeFileUrl(resolved.url);
          return;
        }
        created = resolved.url;
        setFile(resolved);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      active = false;
      revokeFileUrl(created);
    };
    // Deliberately keyed on the handle's fields rather than the object: most
    // callers build it inline, so depending on identity would re-fetch the file
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, handle?.ref, handle?.rowId, handle?.table]);

  const previewable = isPreviewable(file?.mimeType);
  const isPdf = file?.mimeType === 'application/pdf';

  const handleDownload = async () => {
    if (!handle) return;
    setSaving(true);
    try {
      await downloadFile(handle, label);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">{label}</DialogTitle>
          <DialogDescription>{description ?? 'Preview of the stored document.'}</DialogDescription>
        </DialogHeader>

        <div className="min-h-[12rem] overflow-hidden rounded-md border bg-muted/30">
          {error ? (
            <ErrorState title="Could not open this document" error={error} />
          ) : !file ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !previewable ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                This file type can't be shown here. Save it or open it in a new tab.
              </p>
              <Button variant="outline" asChild className="h-11 sm:h-9">
                <a href={file.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open
                </a>
              </Button>
            </div>
          ) : isPdf ? (
            <iframe src={file.url} title={label} className="h-[70vh] w-full" />
          ) : (
            <img src={file.url} alt={label} className="mx-auto max-h-[70vh] w-auto object-contain" />
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleDownload} disabled={saving || !handle?.ref} className="h-11 sm:h-9">
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentPreviewDialog;
