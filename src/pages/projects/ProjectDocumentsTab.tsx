import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Check, CheckCircle2, Clock, FileText, Loader2, Upload, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import DocumentActions from '@/components/common/DocumentActions';
import SectionCard from '@/components/common/SectionCard';
import ErrorState from '@/components/common/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  DOCUMENT_SPECS,
  GROUP_LABELS,
  GROUP_ORDER,
  fetchProjectDocuments,
  handleFor,
  saveProjectDocumentText,
  specsInGroup,
  summariseDocuments,
  uploadProjectDocument,
  type DocumentSpec,
  type ProjectDocument,
} from '@/lib/documents';

interface Props {
  projectId: string;
}

/**
 * Documents grouped by purpose rather than one flat checklist.
 *
 * Every one of the 17 enum types is represented, driven from DOCUMENT_SPECS —
 * previously three disagreeing hardcoded lists meant ten types rendered with
 * blank labels and three could not be uploaded at all.
 */
const ProjectDocumentsTab = ({ projectId }: Props) => {
  const { role, user } = useAuth();
  const { toast } = useToast();
  // Verification is the operator's and admin's job, so removing a wrong
  // document is theirs too. Sales and trades upload and review only.
  const canDelete = role === 'admin' || role === 'operator';

  // One shared file input rather than seventeen hidden ones; the row that
  // opened it is remembered here.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSpec = useRef<DocumentSpec | null>(null);
  const [busyType, setBusyType] = useState<string | null>(null);
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});

  const documentsQuery = useQuery({
    queryKey: ['project-documents', projectId],
    queryFn: () => fetchProjectDocuments(projectId),
  });

  const documents = documentsQuery.data ?? [];
  const progress = summariseDocuments(documents);

  const documentFor = (spec: DocumentSpec): ProjectDocument | undefined =>
    documents.find(
      (d) => d.document_type === spec.type && (d.file_url !== null || d.text_value !== null)
    );

  const chooseFile = (spec: DocumentSpec) => {
    pendingSpec.current = spec;
    // Reset first: choosing the same file twice in a row fires no change event.
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const onFileChosen = async (file: File | undefined) => {
    const spec = pendingSpec.current;
    pendingSpec.current = null;
    if (!file || !spec || !user) return;

    setBusyType(spec.type);
    try {
      await uploadProjectDocument(projectId, user.id, spec.type, file, { label: spec.label });
      toast({ title: 'Document uploaded', description: spec.label });
      documentsQuery.refetch();
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

  const saveText = async (spec: DocumentSpec) => {
    if (!user) return;
    setBusyType(spec.type);
    try {
      await saveProjectDocumentText(projectId, user.id, spec.type, textDrafts[spec.type] ?? '');
      toast({ title: 'Saved', description: spec.label });
      setTextDrafts((drafts) => ({ ...drafts, [spec.type]: '' }));
      documentsQuery.refetch();
    } catch (err) {
      toast({
        title: 'Could not save',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusyType(null);
    }
  };

  if (documentsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (documentsQuery.error) {
    return (
      <ErrorState error={documentsQuery.error} onRetry={() => documentsQuery.refetch()} />
    );
  }

  const percent =
    progress.requiredTotal === 0
      ? 0
      : Math.round((progress.requiredUploaded / progress.requiredTotal) * 100);

  return (
    <div className="space-y-4">
      <SectionCard title="Progress" icon={FileText}>
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">
              {progress.requiredUploaded} of {progress.requiredTotal} required documents
              uploaded
            </span>
            <span className="text-sm font-bold tabular-nums">{percent}%</span>
          </div>
          <Progress value={percent} className="h-2" />
          {progress.allRequiredUploaded && !progress.allUploadedVerified && (
            <p className="flex items-center gap-2 text-xs text-warning">
              <Clock className="h-3.5 w-3.5" />
              All required documents are in. Awaiting operator verification.
            </p>
          )}
          {progress.allUploadedVerified && (
            <p className="flex items-center gap-2 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Every document has been verified.
            </p>
          )}
        </div>
      </SectionCard>

      {GROUP_ORDER.map((group) => {
        const specs = specsInGroup(group);
        if (specs.length === 0) return null;

        const uploadedInGroup = specs.filter((s) => documentFor(s)).length;

        return (
          <SectionCard
            key={group}
            title={GROUP_LABELS[group]}
            actions={
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {uploadedInGroup}/{specs.length}
              </span>
            }
            contentClassName="p-0"
          >
            <ul className="divide-y divide-border/50">
              {specs.map((spec) => {
                const doc = documentFor(spec);
                const verified = doc?.is_verified === true;
                const rejected = Boolean(doc?.rejection_reason);

                return (
                  <li
                    key={spec.type}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={cn(
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                          verified
                            ? 'bg-success/15 text-success'
                            : rejected
                              ? 'bg-destructive/15 text-destructive'
                              : doc
                                ? 'bg-warning/15 text-warning'
                                : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {verified ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : rejected ? (
                          <XCircle className="h-3.5 w-3.5" />
                        ) : doc ? (
                          <Clock className="h-3.5 w-3.5" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        )}
                      </span>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {spec.label}
                          </span>
                          {spec.required && !doc && (
                            <Badge
                              variant="outline"
                              className="border-transparent bg-muted px-1.5 py-0 text-[9px] font-bold uppercase text-muted-foreground"
                            >
                              Required
                            </Badge>
                          )}
                          {spec.isText && (
                            <Badge
                              variant="outline"
                              className="border-transparent bg-muted px-1.5 py-0 text-[9px] font-bold uppercase text-muted-foreground"
                            >
                              Text
                            </Badge>
                          )}
                        </div>

                        {doc?.text_value && (
                          <p className="mt-0.5 truncate text-sm text-foreground">
                            {doc.text_value}
                          </p>
                        )}
                        {rejected && (
                          <p className="mt-0.5 text-xs text-destructive">
                            Rejected: {doc?.rejection_reason}
                          </p>
                        )}
                        {!doc && spec.hint && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{spec.hint}</p>
                        )}
                        {doc && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Uploaded {format(new Date(doc.uploaded_at), 'dd MMM yyyy')} ·{' '}
                            {spec.uploadedBy}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5 sm:ml-4">
                      {doc?.file_url && (
                        <DocumentActions
                          handle={handleFor(doc)}
                          label={spec.label}
                          canDelete={canDelete}
                          onDeleted={() => documentsQuery.refetch()}
                        />
                      )}

                      {spec.isText ? (
                        <div className="flex w-full items-center gap-1.5 sm:w-56">
                          <Input
                            value={textDrafts[spec.type] ?? doc?.text_value ?? ''}
                            onChange={(event) =>
                              setTextDrafts((drafts) => ({
                                ...drafts,
                                [spec.type]: event.target.value,
                              }))
                            }
                            placeholder={
                              spec.type === 'customer_email' ? 'customer@email.com' : '10-digit mobile'
                            }
                            type={spec.type === 'customer_email' ? 'email' : 'tel'}
                            className="h-11 sm:h-9"
                            disabled={busyType === spec.type}
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-11 w-11 shrink-0 sm:h-9 sm:w-9"
                            onClick={() => void saveText(spec)}
                            disabled={busyType === spec.type}
                            aria-label={`Save ${spec.label}`}
                          >
                            {busyType === spec.type ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant={doc ? 'ghost' : 'outline'}
                          size="sm"
                          className="h-11 gap-1.5 text-xs sm:h-9"
                          onClick={() => chooseFile(spec)}
                          disabled={busyType === spec.type}
                        >
                          {busyType === spec.type ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="h-3.5 w-3.5" />
                          )}
                          {doc ? 'Replace' : 'Upload'}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        );
      })}

      {/* One input for the whole tab; `chooseFile` records which row opened it. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={(event) => void onFileChosen(event.target.files?.[0])}
      />

      <p className="px-1 text-xs text-muted-foreground">
        {DOCUMENT_SPECS.length} document types are tracked. Upload or replace any of them here;
        an operator still has to verify each one.
      </p>
    </div>
  );
};

export default ProjectDocumentsTab;
