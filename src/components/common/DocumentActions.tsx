import { useState } from 'react';
import { Download, Eye, Loader2, Trash2 } from 'lucide-react';
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
import DocumentPreviewDialog from '@/components/common/DocumentPreviewDialog';
import { useToast } from '@/hooks/use-toast';
import { deleteFile, downloadFile, type FileHandle } from '@/lib/fileStore';

interface Props {
  handle: FileHandle;
  /** Human name, used as the preview title and the saved filename. */
  label: string;
  /** Hidden when the caller may not delete (a worker viewing a verified doc). */
  canDelete?: boolean;
  /** Clears the file but keeps the row — for records that outlive their photo. */
  keepRowOnDelete?: boolean;
  onDeleted?: () => void;
}

/**
 * Preview · Download · Delete for one stored document.
 *
 * Extracted from the lead documents panel, which was the only screen with all
 * three: the project document pages could not delete at all, and several
 * "preview" buttons only opened a new tab. One component means a document
 * behaves the same wherever it is shown.
 *
 * Buttons are 44px below `sm` per the design system — field staff use these on
 * phones, often outdoors.
 */
const DocumentActions = ({
  handle,
  label,
  canDelete = true,
  keepRowOnDelete = false,
  onDeleted,
}: Props) => {
  const { toast } = useToast();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // A text-value document (customer email, mobile) has no file to preview or
  // save, but it is still a row someone may need to remove.
  const noFile = !handle.ref;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadFile(handle, label);
    } catch (err) {
      toast({
        title: 'Download failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteFile(handle, { keepRow: keepRowOnDelete });
      toast({ title: 'Document deleted', description: label });
      onDeleted?.();
    } catch (err) {
      toast({
        title: 'Could not delete the document',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 sm:h-8 sm:w-8"
          disabled={noFile}
          onClick={() => setPreviewOpen(true)}
          aria-label={`Preview ${label}`}
        >
          <Eye className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 sm:h-8 sm:w-8"
          disabled={noFile || downloading}
          onClick={handleDownload}
          aria-label={`Download ${label}`}
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </Button>

        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 text-destructive hover:text-destructive sm:h-8 sm:w-8"
            disabled={deleting}
            onClick={() => setConfirmOpen(true)}
            aria-label={`Delete ${label}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <DocumentPreviewDialog
        handle={handle}
        label={label}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {noFile
                ? 'This record will be removed from the CRM.'
                : 'The file moves to the Google Drive bin, where it can be restored for 30 days. The record in the CRM is removed now.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default DocumentActions;
