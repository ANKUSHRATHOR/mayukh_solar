import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Loader2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import SectionCard from '@/components/common/SectionCard';
import ErrorState from '@/components/common/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  DOCUMENT_SPECS,
  GROUP_LABELS,
  GROUP_ORDER,
  downloadDocument,
  fetchProjectDocuments,
  getDocumentUrl,
  specsInGroup,
  summariseDocuments,
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
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const view = async (doc: ProjectDocument) => {
    if (!doc.file_url) return;
    setBusyId(doc.id);
    try {
      const url = await getDocumentUrl(doc.file_url);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast({
        title: 'Could not open the document',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  const download = async (doc: ProjectDocument, label: string) => {
    if (!doc.file_url) return;
    setBusyId(doc.id);
    try {
      await downloadDocument(doc.file_url, label);
    } catch (err) {
      toast({
        title: 'Could not download the document',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
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
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
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

                    {doc?.file_url && (
                      <div className="flex shrink-0 items-center gap-1.5 sm:ml-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 gap-1.5 text-xs"
                          onClick={() => view(doc)}
                          disabled={busyId === doc.id}
                        >
                          {busyId === doc.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 gap-1.5 text-xs"
                          onClick={() => download(doc, spec.label)}
                          disabled={busyId === doc.id}
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span className="sr-only sm:not-sr-only">Download</span>
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        );
      })}

      <p className="px-1 text-xs text-muted-foreground">
        {DOCUMENT_SPECS.length} document types are tracked. Uploading is done from the
        document upload screen; this view is for review and verification.
      </p>
    </div>
  );
};

export default ProjectDocumentsTab;
