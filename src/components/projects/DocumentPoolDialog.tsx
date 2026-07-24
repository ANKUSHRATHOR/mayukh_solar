import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { FileText, Loader2, Upload, Trash2, Eye, Download, CheckCircle, Plus } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type DocumentType = Database['public']['Enums']['document_type'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  leadId?: string;
  title?: string;
}

const docTypesList: { value: DocumentType; label: string }[] = [
  { value: 'aadhaar_front', label: 'Aadhaar Card Front' },
  { value: 'aadhaar_back', label: 'Aadhaar Card Back' },
  { value: 'pan_card', label: 'PAN Card' },
  { value: 'property_papers', label: 'Property Papers' },
  { value: 'feasibility', label: 'Feasibility Report' },
  { value: 'netmetering', label: 'Netmetering Submission' },
  { value: 'subsidy', label: 'Subsidy Approval' },
  { value: 'invoice', label: 'Payment Invoice' },
  { value: 'other', label: 'Other Document (Custom Name)' },
];

export default function DocumentPoolDialog({
  open,
  onOpenChange,
  projectId,
  leadId,
  title = 'Document Pool',
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  // Form for custom document type
  const [selectedType, setSelectedType] = useState<DocumentType>('aadhaar_front');
  const [customName, setCustomName] = useState('');

  const fetchDocs = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('project_id', projectId);
      if (error) throw error;
      setDocs(data || []);
    } catch (err: any) {
      toast({ title: 'Error loading documents', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    if (open && projectId) {
      fetchDocs();
    }
  }, [open, projectId, fetchDocs]);

  const getSignedUrl = async (fileUrl: string, download = false): Promise<string | null> => {
    let path = fileUrl;
    const marker = '/project-documents/';
    if (path.includes(marker)) path = path.split(marker)[1];
    const { data, error } = await supabase.storage
      .from('project-documents')
      .createSignedUrl(path, 600, download ? { download: true } : undefined);
    if (error || !data?.signedUrl) {
      toast({ title: 'Cannot open file', description: error?.message || 'Try again', variant: 'destructive' });
      return null;
    }
    return data.signedUrl;
  };

  const handleOpenDoc = async (fileUrl: string) => {
    const url = await getSignedUrl(fileUrl, false);
    if (url) window.open(url, '_blank');
  };

  const handleDownloadDoc = async (fileUrl: string, filename: string) => {
    const url = await getSignedUrl(fileUrl, true);
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId || !user) return;

    if (file.size > 15 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum 15 MB per file', variant: 'destructive' });
      return;
    }

    if (selectedType === 'other' && !customName.trim()) {
      toast({ title: 'Custom name required', description: 'Please type a custom name for other documents.', variant: 'destructive' });
      return;
    }

    setUploading(selectedType);
    try {
      const rawExt = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'bin';
      const cleanType = selectedType === 'other' ? `custom_${Date.now()}` : selectedType;
      const path = `${projectId}/${cleanType}.${rawExt}`;

      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Check if document entry already exists
      const existing = docs.find((d) => d.document_type === selectedType && (selectedType !== 'other' || d.custom_name === customName.trim()));

      if (existing) {
        await supabase.from('documents')
          .update({
            file_url: path,
            uploaded_at: new Date().toISOString(),
            rejection_reason: null,
            uploaded_by_user_id: user.id,
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('documents').insert({
          project_id: projectId,
          lead_id: leadId || null,
          document_type: selectedType,
          file_url: path,
          custom_name: selectedType === 'other' ? customName.trim() : null,
          uploaded_by_user_id: user.id,
        });
      }

      toast({ title: 'Uploaded!', description: `Document saved successfully.` });
      setCustomName('');
      fetchDocs();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(null);
      // Reset input element
      e.target.value = '';
    }
  };

  const handleDelete = async (docId: string, fileUrl: string | null) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    try {
      if (fileUrl) {
        let path = fileUrl;
        const marker = '/project-documents/';
        if (path.includes(marker)) path = path.split(marker)[1];
        await supabase.storage.from('project-documents').remove([path]);
      }
      const { error } = await supabase.from('documents').delete().eq('id', docId);
      if (error) throw error;
      toast({ title: 'Deleted!' });
      fetchDocs();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:rounded-2xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <FileText className="h-5 w-5 text-primary" /> {title}
          </DialogTitle>
          <DialogDescription>
            Upload Aadhaar, PAN card, Property papers, Feasibility, or custom files. Available under both Deal and Project views.
          </DialogDescription>
        </DialogHeader>

        {/* Upload Form */}
        <div className="border rounded-xl p-4 bg-muted/20 space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Upload Document</p>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-3">
              <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                <Label className="text-xs font-semibold">Document Type</Label>
                <Select value={selectedType} onValueChange={(val) => setSelectedType(val as DocumentType)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {docTypesList.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedType === 'other' && (
                <div className="grid grid-cols-[130px_1fr] items-center gap-2">
                  <Label className="text-xs font-semibold">Custom Name *</Label>
                  <Input
                    placeholder="e.g. Feasibility Photo, Cancelled Cheque"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              )}
            </div>

            <div className="shrink-0">
              <Input
                type="file"
                id="docpool-file-upload"
                onChange={handleUpload}
                className="hidden"
                disabled={!!uploading}
              />
              <Button asChild className="h-9 cursor-pointer gap-1.5 text-xs font-semibold">
                <label htmlFor="docpool-file-upload">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Select & Upload
                </label>
              </Button>
            </div>
          </div>
        </div>

        {/* Documents List */}
        <div className="flex-1 overflow-hidden flex flex-col mt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Uploaded Documents ({docs.length})</p>
          <ScrollArea className="flex-1 border rounded-xl bg-card">
            {loading ? (
              <div className="py-12 text-center text-muted-foreground text-sm"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />Loading documents...</div>
            ) : docs.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-xs italic">No documents uploaded to the pool yet.</div>
            ) : (
              <div className="divide-y">
                {docs.map((doc) => {
                  const matched = docTypesList.find(t => t.value === doc.document_type);
                  const typeLabel = doc.document_type === 'other' && doc.custom_name
                    ? doc.custom_name
                    : matched?.label || doc.document_type;

                  return (
                    <div key={doc.id} className="p-3.5 flex items-center justify-between gap-4 hover:bg-muted/10 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-xs text-foreground truncate">{typeLabel}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">
                          File: {doc.file_url ? doc.file_url.split('/').pop() : 'Text Value'} • {new Date(doc.uploaded_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {doc.file_url && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => handleOpenDoc(doc.file_url)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => handleDownloadDoc(doc.file_url, `${doc.document_type}.bin`)}>
                              <Download className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(doc.id, doc.file_url)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter className="pt-4 border-t">
          <Button onClick={() => onOpenChange(false)}>Close Pool</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
