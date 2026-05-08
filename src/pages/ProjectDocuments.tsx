import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Upload, CheckCircle2, AlertCircle, FileText,
  Image as ImageIcon, Send, RefreshCw, Eye
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type DocumentType = Database['public']['Enums']['document_type'];

interface DocRequirement {
  type: DocumentType;
  label: string;
  description: string;
  isFile: boolean; // true = file upload, false = text input
  accept?: string;
}

const requiredDocs: DocRequirement[] = [
  { type: 'electricity_bill', label: 'Electricity Bill', description: 'Upload electricity bill copy', isFile: true, accept: 'image/*,.pdf' },
  { type: 'aadhaar_front', label: 'Aadhaar Card Front', description: 'Front side of Aadhaar card', isFile: true, accept: 'image/*,.pdf' },
  { type: 'aadhaar_back', label: 'Aadhaar Card Back', description: 'Back side of Aadhaar card', isFile: true, accept: 'image/*,.pdf' },
  { type: 'passport_photo', label: 'Passport Photo', description: 'Recent passport size photo', isFile: true, accept: 'image/*' },
  { type: 'bank_passbook', label: 'Bank Passbook First Page', description: 'First page of bank passbook', isFile: true, accept: 'image/*,.pdf' },
  { type: 'customer_email', label: 'Customer Email ID', description: 'Customer email address', isFile: false },
  { type: 'customer_mobile', label: 'Customer Mobile Number', description: 'Customer mobile number', isFile: false },
];

interface DocRecord {
  id: string;
  document_type: DocumentType;
  file_url: string | null;
  text_value: string | null;
  is_verified: boolean;
  rejection_reason: string | null;
  uploaded_at: string;
}

const ProjectDocuments = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [project, setProject] = useState<any>(null);
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [textInputs, setTextInputs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const [projRes, docsRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('documents').select('*').eq('project_id', projectId),
    ]);
    setProject(projRes.data);
    setDocs((docsRes.data as DocRecord[]) || []);

    // Pre-fill text inputs from existing docs
    const texts: Record<string, string> = {};
    (docsRes.data || []).forEach((d: any) => {
      if (d.text_value) texts[d.document_type] = d.text_value;
    });
    setTextInputs(texts);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getDoc = (type: DocumentType) => docs.find(d => d.document_type === type);

  const uploadedCount = requiredDocs.filter(req => {
    const doc = getDoc(req.type);
    return doc && (doc.file_url || doc.text_value);
  }).length;

  const progress = Math.round((uploadedCount / requiredDocs.length) * 100);
  const allUploaded = uploadedCount === requiredDocs.length;

  const handleFileUpload = async (docType: DocumentType, file: File) => {
    if (!projectId || !user) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum 10 MB per file', variant: 'destructive' });
      return;
    }

    setUploading(docType);
    try {
      const ext = file.name.split('.').pop();
      const path = `${projectId}/${docType}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      // Store the storage path (bucket is private; we'll generate signed URLs to view)
      const existingDoc = getDoc(docType);
      if (existingDoc) {
        await supabase.from('documents')
          .update({ file_url: path, uploaded_at: new Date().toISOString(), rejection_reason: null })
          .eq('id', existingDoc.id);
      } else {
        await supabase.from('documents').insert({
          project_id: projectId,
          document_type: docType,
          file_url: path,
          uploaded_by_user_id: user.id,
        });
      }

      toast({ title: 'Uploaded!', description: `${docType.replace(/_/g, ' ')} uploaded successfully` });
      fetchData();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  const handleTextSave = async (docType: DocumentType, value: string) => {
    if (!projectId || !user || !value.trim()) return;
    try {
      const existingDoc = getDoc(docType);
      if (existingDoc) {
        await supabase.from('documents')
          .update({ text_value: value.trim(), uploaded_at: new Date().toISOString(), rejection_reason: null })
          .eq('id', existingDoc.id);
      } else {
        await supabase.from('documents').insert({
          project_id: projectId,
          document_type: docType,
          text_value: value.trim(),
          uploaded_by_user_id: user.id,
        });
      }
      toast({ title: 'Saved!' });
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleSubmitForReview = async () => {
    if (!allUploaded || !projectId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('projects').update({
        documents_submitted_by_sales: true,
        documents_submitted_at: new Date().toISOString(),
        status: 'pending_operator_review',
      }).eq('id', projectId);
      if (error) throw error;
      toast({ title: 'Documents Submitted!', description: 'Operator has been notified for review.' });
      navigate('/');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  if (!project) return <div className="p-8 text-center text-muted-foreground">Project not found</div>;

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      {/* Project Header */}
      <Card className="shadow-card border-border">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Project</p>
              <p className="text-lg font-bold text-foreground">{project.project_code}</p>
            </div>
            <Badge className="gradient-primary text-primary-foreground">{project.capacity_kw} kW</Badge>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Document Progress</span>
              <span className="font-semibold text-foreground">{uploadedCount} of {requiredDocs.length}</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Document Cards */}
      <div className="space-y-3">
        {requiredDocs.map((req) => {
          const doc = getDoc(req.type);
          const isUploaded = doc && (doc.file_url || doc.text_value);
          const isRejected = doc?.rejection_reason;
          const isUploading = uploading === req.type;

          return (
            <Card key={req.type} className={`shadow-card border transition-all ${isRejected ? 'border-destructive/50 bg-destructive/5' : isUploaded ? 'border-success/50 bg-success/5' : 'border-border'}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`mt-0.5 p-2 rounded-lg shrink-0 ${isUploaded ? 'bg-success/10' : 'bg-muted'}`}>
                      {req.isFile ? <FileText className={`h-4 w-4 ${isUploaded ? 'text-success' : 'text-muted-foreground'}`} /> : <FileText className={`h-4 w-4 ${isUploaded ? 'text-success' : 'text-muted-foreground'}`} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-foreground">{req.label}</p>
                        {isUploaded && !isRejected && (
                          <Badge variant="outline" className="text-xs text-success border-success/30">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Uploaded
                          </Badge>
                        )}
                        {isRejected && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" /> Rejected
                          </Badge>
                        )}
                        {!isUploaded && (
                          <Badge variant="secondary" className="text-xs text-destructive">Pending</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{req.description}</p>
                      {isRejected && (
                        <p className="text-xs text-destructive mt-1 font-medium">Reason: {doc.rejection_reason}</p>
                      )}
                      {isUploaded && doc?.uploaded_at && (
                        <p className="text-xs text-muted-foreground mt-1">Uploaded: {new Date(doc.uploaded_at).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Upload / Input area */}
                <div className="mt-3">
                  {req.isFile ? (
                    <div className="flex items-center gap-2">
                      <label className="flex-1">
                        <input
                          type="file"
                          accept={req.accept}
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(req.type, file);
                          }}
                          disabled={isUploading}
                        />
                        <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-accent/30 cursor-pointer transition-all text-sm">
                          {isUploading ? (
                            <><RefreshCw className="h-4 w-4 animate-spin text-primary" /> Uploading...</>
                          ) : (
                            <><Upload className="h-4 w-4 text-muted-foreground" /> {isUploaded ? 'Replace File' : 'Choose File'}</>
                          )}
                        </div>
                      </label>
                      {isUploaded && doc?.file_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            let path = doc.file_url!;
                            const marker = '/project-documents/';
                            if (path.includes(marker)) path = path.split(marker)[1];
                            const { data, error } = await supabase.storage
                              .from('project-documents')
                              .createSignedUrl(path, 60 * 10);
                            if (error || !data?.signedUrl) {
                              toast({ title: 'Cannot open file', description: error?.message || 'Try again', variant: 'destructive' });
                              return;
                            }
                            window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={textInputs[req.type] || ''}
                        onChange={e => setTextInputs(prev => ({ ...prev, [req.type]: e.target.value }))}
                        placeholder={req.type === 'customer_email' ? 'customer@email.com' : '10-digit mobile number'}
                        className="h-10"
                        type={req.type === 'customer_email' ? 'email' : 'tel'}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleTextSave(req.type, textInputs[req.type] || '')}
                        disabled={!textInputs[req.type]?.trim()}
                        className="gradient-primary text-primary-foreground h-10 px-4"
                      >
                        Save
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Submit button */}
      <Card className="shadow-elevated border-0">
        <CardContent className="p-5">
          <Button
            onClick={handleSubmitForReview}
            disabled={!allUploaded || submitting || project.documents_submitted_by_sales}
            className="w-full h-12 gradient-primary text-primary-foreground font-semibold"
          >
            {project.documents_submitted_by_sales ? (
              <><CheckCircle2 className="mr-2 h-4 w-4" /> Documents Already Submitted</>
            ) : submitting ? (
              'Submitting...'
            ) : (
              <><Send className="mr-2 h-4 w-4" /> Submit for Review ({uploadedCount}/{requiredDocs.length})</>
            )}
          </Button>
          {!allUploaded && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Upload all {requiredDocs.length} mandatory documents to enable submission
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProjectDocuments;
