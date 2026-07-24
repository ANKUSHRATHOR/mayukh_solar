import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Download,
  FileText,
  FolderOpen,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import SectionCard from '@/components/common/SectionCard';
import ErrorState from '@/components/common/ErrorState';
import EmptyState from '@/components/common/EmptyState';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import {
  DOCUMENT_SPECS,
  GROUP_LABELS,
  GROUP_ORDER,
  documentLabels,
  downloadDocument,
  specsInGroup,
  type DocumentType,
} from '@/lib/documents';
import { uploadVisitDocument } from '@/lib/visits';

interface Props {
  leadId: string;
  userId: string;
}

interface LeadDocumentRow {
  id: string;
  document_type: DocumentType;
  file_url: string | null;
  text_value: string | null;
  uploaded_at: string;
}

const isImagePath = (path: string) => /\.(jpe?g|png|webp|gif)$/i.test(path);
const isPdfPath = (path: string) => /\.pdf$/i.test(path);

/**
 * Lead document manager: upload by type, browse as a table or a thumbnail
 * grid, preview inline, and download / replace / delete per document.
 *
 * Files live in the `project-documents` bucket under `leads/{leadId}/…` with
 * one file per document type (uploading the same type replaces the file), so
 * these are the same documents the visit-completion flow collects.
 */
const LeadDocumentsPanel = ({ leadId, userId }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [view, setView] = useState<'table' | 'grid'>('table');
  const [addType, setAddType] = useState<string>('');
  const [previewDoc, setPreviewDoc] = useState<LeadDocumentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeadDocumentRow | null>(null);
  // Which type an in-flight upload belongs to, to show a row-level spinner.
  const [busyType, setBusyType] = useState<DocumentType | null>(null);

  const addInputRef = useRef<HTMLInputElement | null>(null);
  // One hidden input per row for Replace.
  const replaceInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const docsQuery = useQuery({
    queryKey: ['lead-documents', leadId],
    queryFn: async (): Promise<LeadDocumentRow[]> => {
      const { data, error } = await supabase
        .from('documents')
        .select('id, document_type, file_url, text_value, uploaded_at')
        .eq('lead_id', leadId)
        .order('uploaded_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data as LeadDocumentRow[]) ?? [];
    },
  });

  const documents = useMemo(
    () => (docsQuery.data ?? []).filter((d) => d.file_url || d.text_value),
    [docsQuery.data]
  );

  // One batch of signed URLs for every stored file — used by thumbnails and
  // the preview dialog. Signed on read; paths are what the DB stores.
  const paths = useMemo(
    () => documents.map((d) => d.file_url).filter((p): p is string => Boolean(p)),
    [documents]
  );
  const urlsQuery = useQuery({
    queryKey: ['lead-document-urls', leadId, paths],
    enabled: paths.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('project-documents')
        .createSignedUrls(paths, 3600);
      if (error) throw new Error(error.message);
      const map: Record<string, string> = {};
      data?.forEach((entry) => {
        if (entry.signedUrl && entry.path) map[entry.path] = entry.signedUrl;
      });
      return map;
    },
  });
  const urlFor = (path: string | null) => (path ? urlsQuery.data?.[path] : undefined);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['lead-documents', leadId] });
    queryClient.invalidateQueries({ queryKey: ['lead-document-urls', leadId] });
  };

  const upload = async (type: DocumentType, file: File) => {
    setBusyType(type);
    try {
      await uploadVisitDocument(leadId, userId, type, file);
      toast({ title: 'Document saved', description: documentLabels[type] });
      refresh();
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusyType(null);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (doc: LeadDocumentRow) => {
      if (doc.file_url) {
        // Best effort — a stale storage object without a DB row is harmless,
        // the reverse (row without file) shows a broken document.
        await supabase.storage.from('project-documents').remove([doc.file_url]);
      }
      const { error } = await supabase.from('documents').delete().eq('id', doc.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, doc) => {
      toast({ title: 'Document deleted', description: documentLabels[doc.document_type] });
      refresh();
    },
    onError: (err) => {
      toast({
        title: 'Could not delete the document',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    },
    onSettled: () => setDeleteTarget(null),
  });

  const handleDownload = async (doc: LeadDocumentRow) => {
    if (!doc.file_url) return;
    try {
      await downloadDocument(doc.file_url, documentLabels[doc.document_type]);
    } catch (err) {
      toast({
        title: 'Download failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  // Only file-based types can be uploaded here; text values (email, mobile)
  // are edited on the contact card.
  const uploadableSpecs = DOCUMENT_SPECS.filter((s) => !s.isText);

  const thumb = (doc: LeadDocumentRow, size: 'sm' | 'lg') => {
    const url = urlFor(doc.file_url);
    const box = size === 'sm' ? 'h-11 w-11 rounded-lg' : 'h-32 w-full rounded-t-xl';
    if (doc.file_url && url && isImagePath(doc.file_url)) {
      return (
        <img
          src={url}
          alt={documentLabels[doc.document_type]}
          className={cn(box, 'shrink-0 border border-border/60 bg-muted object-cover')}
          loading="lazy"
        />
      );
    }
    return (
      <div
        className={cn(
          box,
          'flex shrink-0 items-center justify-center border border-border/60 bg-muted/50 text-muted-foreground'
        )}
      >
        <FileText className={size === 'sm' ? 'h-5 w-5' : 'h-10 w-10'} />
      </div>
    );
  };

  const rowActions = (doc: LeadDocumentRow) => (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {busyType === doc.document_type ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => void handleDownload(doc)}
            aria-label="Download"
            title="Download"
            disabled={!doc.file_url}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => replaceInputs.current[doc.id]?.click()}
            aria-label="Replace"
            title="Replace"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteTarget(doc)}
            aria-label="Delete"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
      <input
        ref={(el) => (replaceInputs.current[doc.id] = el)}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void upload(doc.document_type, file);
        }}
      />
    </div>
  );

  const previewUrl = previewDoc ? urlFor(previewDoc.file_url) : undefined;

  return (
    <>
      <SectionCard
        title="Documents"
        description={`${documents.length} on file`}
        icon={FolderOpen}
        contentClassName="p-0"
        actions={
          <div className="flex items-center gap-1 rounded-lg border border-border/70 p-0.5">
            <Button
              variant={view === 'table' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={() => setView('table')}
              aria-label="Table view"
              title="Table view"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={view === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={() => setView('grid')}
              aria-label="Grid view"
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        }
      >
        {/* Add bar */}
        <div className="flex flex-col gap-2 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center">
          <Select value={addType} onValueChange={setAddType}>
            <SelectTrigger className="h-9 w-full text-sm sm:w-64">
              <SelectValue placeholder="Select document type…" />
            </SelectTrigger>
            <SelectContent>
              {GROUP_ORDER.map((group) => {
                const specs = specsInGroup(group).filter((s) => !s.isText);
                if (specs.length === 0) return null;
                return (
                  <SelectGroup key={group}>
                    <SelectLabel className="pl-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                      {GROUP_LABELS[group]}
                    </SelectLabel>
                    {specs.map((s) => (
                      <SelectItem key={s.type} value={s.type}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                );
              })}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-9 gap-1.5"
            disabled={!addType || busyType !== null}
            onClick={() => addInputRef.current?.click()}
          >
            {busyType && addType === busyType ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add document
          </Button>
          <input
            ref={addInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file && addType) void upload(addType as DocumentType, file);
            }}
          />
          {addType && documents.some((d) => d.document_type === addType && d.file_url) && (
            <p className="text-[11px] text-warning">
              A {documentLabels[addType as DocumentType]} is already on file — adding replaces it.
            </p>
          )}
        </div>

        {docsQuery.isLoading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        ) : docsQuery.error ? (
          <ErrorState error={docsQuery.error} onRetry={() => docsQuery.refetch()} />
        ) : documents.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No documents yet"
            description="Pick a document type above and add the first file."
          />
        ) : view === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/50 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">Document</th>
                  <th className="hidden px-4 py-2.5 sm:table-cell">Uploaded</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {documents.map((doc) => (
                  <tr
                    key={doc.id}
                    className={cn(
                      'transition-colors',
                      doc.file_url && 'cursor-pointer hover:bg-accent/40'
                    )}
                    onClick={() => doc.file_url && setPreviewDoc(doc)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        {thumb(doc, 'sm')}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            {documentLabels[doc.document_type] ?? doc.document_type}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {doc.file_url
                              ? doc.file_url.split('/').pop()
                              : doc.text_value}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-2.5 text-xs text-muted-foreground sm:table-cell">
                      {format(new Date(doc.uploaded_at), 'dd MMM yyyy, h:mm a')}
                    </td>
                    <td className="px-4 py-2.5">{doc.file_url ? rowActions(doc) : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className={cn(
                  'overflow-hidden rounded-xl border border-border/70 bg-card shadow-card transition-all',
                  doc.file_url && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-elevated'
                )}
                onClick={() => doc.file_url && setPreviewDoc(doc)}
              >
                {thumb(doc, 'lg')}
                <div className="space-y-1.5 p-3">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {documentLabels[doc.document_type] ?? doc.document_type}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(doc.uploaded_at), 'dd MMM yyyy')}
                  </p>
                  {doc.file_url ? rowActions(doc) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Preview */}
      <Dialog open={Boolean(previewDoc)} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="flex h-[85vh] w-[95vw] max-w-3xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 flex-row items-center justify-between border-b border-border/60 px-5 py-3.5">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <FileText className="h-4 w-4 text-primary" />
              {previewDoc ? documentLabels[previewDoc.document_type] : ''}
            </DialogTitle>
            <DialogDescription className="sr-only">Document preview</DialogDescription>
            <div className="flex items-center gap-2 pr-8">
              <Badge variant="secondary" className="text-[10px]">
                {previewDoc &&
                  format(new Date(previewDoc.uploaded_at), 'dd MMM yyyy, h:mm a')}
              </Badge>
              {previewDoc && (
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void handleDownload(previewDoc)}>
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-muted/30 p-4">
            {previewDoc?.file_url && previewUrl ? (
              isImagePath(previewDoc.file_url) ? (
                <img
                  src={previewUrl}
                  alt={documentLabels[previewDoc.document_type]}
                  className="mx-auto max-h-full rounded-lg border border-border/60 object-contain"
                />
              ) : isPdfPath(previewDoc.file_url) ? (
                <iframe
                  src={previewUrl}
                  title={documentLabels[previewDoc.document_type]}
                  className="h-full w-full rounded-lg border border-border/60 bg-white"
                />
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No inline preview for this file type — use Download.
                </p>
              )
            ) : (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget ? documentLabels[deleteTarget.document_type] : 'document'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The file is removed from storage as well. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default LeadDocumentsPanel;
