import { useEffect, useState, useCallback } from 'react';
import JSZip from 'jszip';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, CheckCircle2, XCircle, FileText, Eye,
  ClipboardCheck, CreditCard, Package, Truck, Wrench, Zap,
  Calendar, Search, Award, PartyPopper, Download, Share2, PhoneCall
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import StageChecklist from '@/components/projects/StageChecklist';
import QuotationButton from '@/components/projects/QuotationButton';

import type { Database } from '@/integrations/supabase/types';

type ProjectStatus = Database['public']['Enums']['project_status'];
type DocumentType = Database['public']['Enums']['document_type'];

interface DocRecord {
  id: string;
  document_type: DocumentType;
  file_url: string | null;
  text_value: string | null;
  is_verified: boolean | null;
  rejection_reason: string | null;
  uploaded_at: string;
}

const docLabels: Record<DocumentType, string> = {
  electricity_bill: 'Electricity Bill',
  aadhaar_front: 'Aadhaar Front',
  aadhaar_back: 'Aadhaar Back',
  passport_photo: 'Passport Photo',
  bank_passbook: 'Bank Passbook',
  customer_email: 'Customer Email',
  customer_mobile: 'Customer Mobile',
};

const statusLabels: Record<ProjectStatus, string> = {
  pending_documents: 'Pending Documents',
  pending_operator_review: 'Pending Review',
  registration_pending: 'Registration Pending',
  registration_done: 'Registration Done',
  loan_process: 'Loan Process',
  loan_done: 'Loan Done',
  cash_file: 'Cash File',
  material_ordered: 'Material Ordered',
  material_dispatched: 'Material Dispatched',
  material_delivered: 'Material Delivered',
  installation_pending: 'Installation Pending',
  installation_done: 'Installation Done',
  wiring_pending: 'Wiring Pending',
  wiring_done: 'Wiring Done',
  net_metering_submitted: 'Net Metering Submitted',
  inspection_scheduled: 'Inspection Scheduled',
  inspection_completed: 'Inspection Completed',
  inspection_failed: 'Inspection Failed',
  net_meter_installed: 'Net Meter Installed',
  project_completed: 'Project Completed',
};

// Define allowed next statuses per current status
const nextStatusMap: Partial<Record<ProjectStatus, ProjectStatus[]>> = {
  pending_operator_review: ['registration_pending'],
  registration_pending: ['registration_done'],
  registration_done: ['loan_process', 'cash_file'],
  loan_process: ['loan_done'],
  loan_done: ['material_ordered'],
  cash_file: ['material_ordered'],
  material_ordered: ['material_dispatched'],
  material_dispatched: ['material_delivered'],
  material_delivered: ['installation_pending'],
  installation_pending: ['installation_done'],
  installation_done: ['wiring_pending'],
  wiring_pending: ['wiring_done'],
  wiring_done: ['net_metering_submitted'],
  net_metering_submitted: ['inspection_scheduled'],
  inspection_scheduled: ['inspection_completed', 'inspection_failed'],
  inspection_failed: ['inspection_scheduled'],
  inspection_completed: ['net_meter_installed'],
  net_meter_installed: ['project_completed'],
};

const OperatorProjectDetail = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [project, setProject] = useState<any>(null);
  const [lead, setLead] = useState<any>(null);
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [loanBank, setLoanBank] = useState('');
  const [updating, setUpdating] = useState(false);
  const [welders, setWelders] = useState<{ user_id: string; full_name: string }[]>([]);
  const [electricians, setElectricians] = useState<{ user_id: string; full_name: string }[]>([]);
  const [selectedWelder, setSelectedWelder] = useState('');
  const [selectedElectrician, setSelectedElectrician] = useState('');
  const [netMeteringFileNumber, setNetMeteringFileNumber] = useState('');
  const [inspectionDate, setInspectionDate] = useState('');
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [netMeterNumber, setNetMeterNumber] = useState('');
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [statusNote, setStatusNote] = useState('');
  const [statusNotesHistory, setStatusNotesHistory] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const [projRes, docsRes, staffRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('documents').select('*').eq('project_id', projectId),
      supabase.from('user_roles').select('user_id, role').in('role', ['welder', 'electrician']),
    ]);

    const proj = projRes.data;
    setProject(proj);
    setDocs((docsRes.data as DocRecord[]) || []);
    setLoanBank(proj?.loan_bank || '');
    setSelectedWelder(proj?.assigned_welder_id || '');
    setSelectedElectrician(proj?.assigned_electrician_id || '');
    setNetMeteringFileNumber(proj?.net_metering_file_number || '');
    setInspectionDate(proj?.inspection_date || '');
    setInspectionNotes(proj?.inspection_notes || '');
    setNetMeterNumber(proj?.net_meter_number || '');

    // Fetch staff names for welders/electricians
    const roleData = staffRes.data || [];
    const welderIds = roleData.filter(r => r.role === 'welder').map(r => r.user_id);
    const elecIds = roleData.filter(r => r.role === 'electrician').map(r => r.user_id);

    if (welderIds.length > 0 || elecIds.length > 0) {
      const allIds = [...welderIds, ...elecIds];
      const { data: staffData } = await supabase.from('staff').select('user_id, full_name').in('user_id', allIds).eq('is_active', true);
      const staffMap = new Map((staffData || []).map(s => [s.user_id, s.full_name]));
      setWelders(welderIds.filter(id => staffMap.has(id)).map(id => ({ user_id: id, full_name: staffMap.get(id)! })));
      setElectricians(elecIds.filter(id => staffMap.has(id)).map(id => ({ user_id: id, full_name: staffMap.get(id)! })));
    }

    if (proj?.lead_id) {
      const { data: leadData } = await supabase.from('leads').select('*').eq('id', proj.lead_id).single();
      setLead(leadData);
    }

    const { data: notesData } = await supabase
      .from('project_status_notes')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    setStatusNotesHistory(notesData || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getSignedUrl = async (fileUrl: string, download = false): Promise<string | null> => {
    let path = fileUrl;
    const marker = '/project-documents/';
    if (path.includes(marker)) path = path.split(marker)[1];
    const { data, error } = await supabase.storage
      .from('project-documents')
      .createSignedUrl(path, 60 * 10, download ? { download: true } : undefined);
    if (error || !data?.signedUrl) {
      toast({ title: 'Cannot open file', description: error?.message || 'Try again', variant: 'destructive' });
      return null;
    }
    return data.signedUrl;
  };

  const handleViewDoc = async (fileUrl: string) => {
    const url = await getSignedUrl(fileUrl);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadDoc = async (fileUrl: string, label: string) => {
    const url = await getSignedUrl(fileUrl, true);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${label}.${fileUrl.split('.').pop()}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleShareDoc = async (fileUrl: string, label: string) => {
    const url = await getSignedUrl(fileUrl);
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: label, url });
        return;
      } catch { /* fallthrough to copy */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied', description: 'Share link copied to clipboard.' });
    } catch {
      toast({ title: 'Share link', description: url });
    }
  };

  const handleBulkDownload = async () => {
    const fileDocs = docs.filter(d => d.file_url);
    if (fileDocs.length === 0) return;
    setBulkDownloading(true);
    try {
      const zip = new JSZip();
      let added = 0;
      for (const d of fileDocs) {
        const url = await getSignedUrl(d.file_url!);
        if (!url) continue;
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const blob = await res.blob();
          const ext = (d.file_url!.split('.').pop() || 'bin').split('?')[0];
          zip.file(`${docLabels[d.document_type]}.${ext}`, blob);
          added++;
        } catch (e) {
          console.warn('skip doc', d.document_type, e);
        }
      }
      if (added === 0) {
        toast({ title: 'No files downloaded', variant: 'destructive' });
        return;
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${project?.project_code || 'project'}-documents.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      toast({ title: 'ZIP ready', description: `${added} file(s) downloaded` });
    } catch (err: any) {
      toast({ title: 'Bulk download failed', description: err.message, variant: 'destructive' });
    } finally {
      setBulkDownloading(false);
    }
  };

  const handleApproveDoc = async (docId: string) => {
    const { error } = await supabase.from('documents').update({
      is_verified: true,
      rejection_reason: null,
    }).eq('id', docId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Document approved' });
      fetchData();
    }
  };

  const handleRejectDoc = async (docId: string) => {
    const reason = rejectionReasons[docId];
    if (!reason?.trim()) {
      toast({ title: 'Enter rejection reason', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('documents').update({
      is_verified: false,
      rejection_reason: reason.trim(),
    }).eq('id', docId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Document rejected', description: 'Sales person will be notified to re-upload.' });
      // Also set project back to pending_documents
      await supabase.from('projects').update({ status: 'pending_documents' as ProjectStatus }).eq('id', projectId!);
      fetchData();
    }
  };

  const handleStatusUpdate = async (newStatus: ProjectStatus) => {
    if (!projectId) return;
    if (!statusNote.trim() || statusNote.trim().length < 5) {
      toast({
        title: 'Note required',
        description: 'Please add a short note (min 5 chars) explaining why this stage is being updated.',
        variant: 'destructive',
      });
      return;
    }
    setUpdating(true);

    // Pre-check stage requirements so we can show a precise blocker instead of the generic trigger error
    const { data: reqData } = await supabase.rpc('project_stage_requirements', { _project_id: projectId });
    const req = (reqData ?? {}) as Record<string, boolean>;
    const blockers: string[] = [];
    const gatedStatuses: ProjectStatus[] = ['registration_pending', 'registration_done', 'loan_process', 'loan_done', 'cash_file'];
    if (gatedStatuses.includes(newStatus)) {
      if (!req.documents_verified) blockers.push('All documents must be approved');
      if (!req.quotation_created) blockers.push('A quotation must be created for this project');
    }
    if (['material_ordered', 'material_dispatched'].includes(newStatus) && !req.quotation_created) {
      blockers.push('A quotation must be created');
    }
    if (['material_delivered', 'installation_pending'].includes(newStatus)) {
      if (!req.material_dispatched) blockers.push('Material dispatch must be recorded');
      if (!req.home_location_saved) blockers.push('Home location must be saved');
    }
    if (['installation_done', 'wiring_pending', 'wiring_done'].includes(newStatus) && !req.material_dispatched) {
      blockers.push('Material dispatch must be recorded');
    }
    if (['net_metering_submitted', 'inspection_scheduled', 'inspection_completed', 'net_meter_installed', 'project_completed'].includes(newStatus) && !req.serial_numbers_entered) {
      blockers.push('Serial numbers must be entered');
    }
    if (blockers.length > 0) {
      toast({
        title: `Cannot move to ${statusLabels[newStatus]}`,
        description: blockers.join(' • '),
        variant: 'destructive',
      });
      setUpdating(false);
      return;
    }

    const updates: any = { status: newStatus };

    if (newStatus === 'loan_process' && loanBank) updates.loan_bank = loanBank;
    if (newStatus === 'installation_pending' && selectedWelder) updates.assigned_welder_id = selectedWelder;
    if (newStatus === 'wiring_pending' && selectedElectrician) updates.assigned_electrician_id = selectedElectrician;
    if (newStatus === 'net_metering_submitted' && netMeteringFileNumber) updates.net_metering_file_number = netMeteringFileNumber;
    if (newStatus === 'inspection_scheduled' && inspectionDate) updates.inspection_date = inspectionDate;
    if ((newStatus === 'inspection_completed' || newStatus === 'inspection_failed') && inspectionNotes) updates.inspection_notes = inspectionNotes;
    if (newStatus === 'net_meter_installed' && netMeterNumber) updates.net_meter_number = netMeterNumber;
    if (newStatus === 'project_completed') updates.completed_at = new Date().toISOString();

    const fromStatus = project?.status as ProjectStatus | undefined;
    const { error } = await supabase.from('projects').update(updates).eq('id', projectId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      if (user?.id) {
        await supabase.from('project_status_notes').insert({
          project_id: projectId,
          from_status: fromStatus ?? null,
          to_status: newStatus,
          note: statusNote.trim(),
          created_by: user.id,
        });
      }
      toast({ title: 'Status Updated', description: `Project moved to ${statusLabels[newStatus]}` });
      setStatusNote('');
      fetchData();
    }
    setUpdating(false);
  };

  const allDocsApproved = docs.length > 0 && docs.every(d => d.is_verified === true);
  const nextStatuses = project ? (nextStatusMap[project.status as ProjectStatus] || []) : [];

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  if (!project) return <div className="p-8 text-center text-muted-foreground">Project not found</div>;

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      {/* Project Info */}
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-xl">{project.project_code}</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                className={
                  project.payment_type === 'loan'
                    ? 'bg-blue-600 text-white hover:bg-blue-600'
                    : 'bg-emerald-600 text-white hover:bg-emerald-600'
                }
              >
                {project.payment_type === 'loan' ? '🏦 LOAN FILE' : '💵 CASH FILE'}
              </Badge>
              <Badge className="gradient-primary text-primary-foreground">{statusLabels[project.status as ProjectStatus]}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div><p className="text-muted-foreground text-xs">Customer</p><p className="font-medium">{lead?.customer_name || project.consumer_name || '—'}</p></div>
            <div><p className="text-muted-foreground text-xs">Mobile</p><p className="font-medium">{lead?.mobile || '—'}</p></div>
            <div><p className="text-muted-foreground text-xs">K Number</p><p className="font-medium">{project.k_number || 'Not assigned'}</p></div>
            <div><p className="text-muted-foreground text-xs">Capacity</p><p className="font-medium">{project.capacity_kw} kW</p></div>
            <div><p className="text-muted-foreground text-xs">Panels</p><p className="font-medium">{project.panel_qty}x {project.panel_watt}W {project.panel_brand}</p></div>
            <div><p className="text-muted-foreground text-xs">Inverter</p><p className="font-medium">{project.inverter_brand} ({project.inverter_capacity} kW)</p></div>
            <div>
              <p className="text-muted-foreground text-xs">Payment Type</p>
              <p className={`font-semibold ${project.payment_type === 'loan' ? 'text-blue-600' : 'text-emerald-600'}`}>
                {project.payment_type === 'loan' ? 'LOAN' : 'CASH'}
              </p>
            </div>
            <div><p className="text-muted-foreground text-xs">Amount</p><p className="font-medium">₹{Number(project.final_amount).toLocaleString('en-IN')}</p></div>
            <div>
              <p className="text-muted-foreground text-xs">Lead Source</p>
              <p className="font-medium capitalize">
                {lead?.source ? String(lead.source).replace(/_/g, ' ') : 'Not Specified'}
                {lead?.source === 'reference' && lead?.reference_name ? ` (${lead.reference_name})` : ''}
              </p>
            </div>
            {project.payment_type === 'loan' && project.loan_bank && (
              <div><p className="text-muted-foreground text-xs">Loan Bank</p><p className="font-medium">{project.loan_bank}</p></div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {lead?.mobile && (
              <Button asChild size="sm" variant="outline" className="border-success/40 text-success hover:bg-success/10">
                <a href={`tel:${lead.mobile}`}>
                  <PhoneCall className="mr-2 h-4 w-4" /> Call Client
                </a>
              </Button>
            )}
            <QuotationButton projectId={project.id} size="sm" />
            <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${project.id}/material-dispatch`)}>
              <Package className="mr-2 h-4 w-4" /> Material Dispatch
            </Button>
          </div>

        </CardContent>
      </Card>

      <StageChecklist projectId={project.id} isOperator />


      {/* All Project Documents — always visible to operator */}
      <Card className="shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" /> All Project Documents
            </CardTitle>
            {docs.some(d => d.file_url) && (
              <Button size="sm" variant="outline" onClick={handleBulkDownload} disabled={bulkDownloading}>
                <Download className="h-4 w-4 mr-1" />
                {bulkDownloading ? 'Preparing ZIP...' : 'Bulk Download (ZIP)'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {docs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No documents uploaded yet.</p>
          ) : (
            docs.map(doc => (
              <div key={`all-${doc.id}`} className="flex items-center justify-between gap-2 border border-border rounded-lg p-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{docLabels[doc.document_type]}</p>
                    {doc.text_value && <p className="text-xs text-muted-foreground truncate">{doc.text_value}</p>}
                  </div>
                </div>
                {doc.file_url && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => handleViewDoc(doc.file_url!)}>
                      <Eye className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">View</span>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDownloadDoc(doc.file_url!, `${docLabels[doc.document_type]}-${project.project_code}`)}>
                      <Download className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Download</span>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleShareDoc(doc.file_url!, docLabels[doc.document_type])}>
                      <Share2 className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Share</span>
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Document Review — only show when in review status */}
      {(project.status === 'pending_operator_review' || project.status === 'pending_documents') && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" /> Document Review
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {docs.length === 0 ? (
              <p className="text-muted-foreground text-sm">No documents submitted yet.</p>
            ) : (
              docs.map(doc => (
                <div key={doc.id} className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold text-sm">{docLabels[doc.document_type]}</span>
                    </div>
                    {doc.is_verified === true && (
                      <Badge className="bg-emerald-100 text-emerald-800"><CheckCircle2 className="h-3 w-3 mr-1" /> Approved</Badge>
                    )}
                    {doc.is_verified === false && doc.rejection_reason && (
                      <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>
                    )}
                    {doc.is_verified === null || (doc.is_verified === false && !doc.rejection_reason) ? (
                      <Badge variant="secondary">Pending</Badge>
                    ) : null}
                  </div>

                  {/* Value / preview */}
                  {doc.file_url && (
                    <div className="flex gap-2 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => handleViewDoc(doc.file_url!)}>
                        <Eye className="h-4 w-4 mr-1" /> View File
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDownloadDoc(doc.file_url!, `${docLabels[doc.document_type]}-${project.project_code}`)}>
                        <Download className="h-4 w-4 mr-1" /> Download
                      </Button>
                    </div>
                  )}
                  {doc.text_value && (
                    <p className="text-sm bg-muted/50 rounded px-3 py-2">{doc.text_value}</p>
                  )}

                  {/* Rejection reason */}
                  {doc.rejection_reason && (
                    <p className="text-xs text-destructive font-medium">Rejection: {doc.rejection_reason}</p>
                  )}

                  {/* Actions */}
                  {project.status === 'pending_operator_review' && doc.is_verified !== true && (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        placeholder="Rejection reason (if rejecting)"
                        value={rejectionReasons[doc.id] || ''}
                        onChange={e => setRejectionReasons(prev => ({ ...prev, [doc.id]: e.target.value }))}
                        className="flex-1 h-9 text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleApproveDoc(doc.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleRejectDoc(doc.id)}>
                          <XCircle className="h-4 w-4 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Approve all docs and move forward */}
            {project.status === 'pending_operator_review' && allDocsApproved && (
              <div className="pt-2">
                <Button
                  onClick={() => handleStatusUpdate('registration_pending')}
                  disabled={updating}
                  className="w-full gradient-primary text-primary-foreground h-11 font-semibold"
                >
                  <ClipboardCheck className="mr-2 h-4 w-4" /> All Documents Verified — Move to Registration
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loan Bank Input */}
      {project.status === 'registration_done' && project.payment_type === 'loan' && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-primary" /> Loan Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Bank Name</label>
              <Input
                value={loanBank}
                onChange={e => setLoanBank(e.target.value)}
                placeholder="Enter bank name for loan"
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assign Welder — when moving to installation_pending */}
      {nextStatuses.includes('installation_pending' as ProjectStatus) && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Wrench className="h-5 w-5 text-primary" /> Assign Welder
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedWelder} onValueChange={setSelectedWelder}>
              <SelectTrigger><SelectValue placeholder="Select a welder" /></SelectTrigger>
              <SelectContent>
                {welders.map(w => (
                  <SelectItem key={w.user_id} value={w.user_id}>{w.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {welders.length === 0 && <p className="text-xs text-muted-foreground mt-2">No welders found. Create welder staff first.</p>}
          </CardContent>
        </Card>
      )}

      {/* Assign Electrician — when moving to wiring_pending */}
      {nextStatuses.includes('wiring_pending' as ProjectStatus) && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5 text-primary" /> Assign Electrician
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedElectrician} onValueChange={setSelectedElectrician}>
              <SelectTrigger><SelectValue placeholder="Select an electrician" /></SelectTrigger>
              <SelectContent>
                {electricians.map(e => (
                  <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {electricians.length === 0 && <p className="text-xs text-muted-foreground mt-2">No electricians found. Create electrician staff first.</p>}
          </CardContent>
        </Card>
      )}

      {/* Net Metering File Number — when submitting net metering */}
      {project.status === 'wiring_done' && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardCheck className="h-5 w-5 text-primary" /> Net Metering Submission
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm">File Number</Label>
              <Input
                value={netMeteringFileNumber}
                onChange={e => setNetMeteringFileNumber(e.target.value)}
                placeholder="Enter net metering file/application number"
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inspection Date — when scheduling inspection */}
      {project.status === 'net_metering_submitted' && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5 text-primary" /> Schedule Inspection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm">Inspection Date</Label>
              <Input
                type="date"
                value={inspectionDate}
                onChange={e => setInspectionDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inspection Result — when completing or failing inspection */}
      {project.status === 'inspection_scheduled' && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Search className="h-5 w-5 text-primary" /> Inspection Result
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {project.inspection_date && (
              <p className="text-sm text-muted-foreground">
                Scheduled: <span className="font-medium text-foreground">{new Date(project.inspection_date).toLocaleDateString('en-IN')}</span>
              </p>
            )}
            <div>
              <Label className="text-sm">Inspection Notes</Label>
              <Textarea
                value={inspectionNotes}
                onChange={e => setInspectionNotes(e.target.value)}
                placeholder="Enter inspection observations, meter readings, etc."
                className="mt-1"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Net Meter Number — when installing net meter */}
      {project.status === 'inspection_completed' && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Award className="h-5 w-5 text-primary" /> Net Meter Installation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm">Net Meter Number</Label>
              <Input
                value={netMeterNumber}
                onChange={e => setNetMeterNumber(e.target.value)}
                placeholder="Enter net meter serial number"
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Project Completed Banner */}
      {project.status === 'project_completed' && (
        <Card className="shadow-card border-emerald-200 dark:border-emerald-800">
          <CardContent className="py-8 text-center space-y-3">
            <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
              <PartyPopper className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-foreground">Project Completed! 🎉</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              This project has been successfully completed. Net meter installed and all stages verified.
            </p>
            {project.completed_at && (
              <p className="text-xs text-muted-foreground">
                Completed on {new Date(project.completed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
            {project.net_meter_number && (
              <p className="text-sm"><span className="text-muted-foreground">Net Meter:</span> <span className="font-medium">{project.net_meter_number}</span></p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Status Pipeline Actions */}
      {nextStatuses.length > 0 && (project.status !== 'pending_operator_review' || allDocsApproved) && project.status !== 'pending_operator_review' && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Update Project Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Current: <span className="font-semibold text-foreground">{statusLabels[project.status as ProjectStatus]}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {nextStatuses.map(ns => {
                const needsWelder = ns === 'installation_pending' && !selectedWelder;
                const needsElectrician = ns === 'wiring_pending' && !selectedElectrician;
                const needsFileNumber = ns === 'net_metering_submitted' && !netMeteringFileNumber.trim();
                const needsInspDate = ns === 'inspection_scheduled' && !inspectionDate;
                const needsMeterNum = ns === 'net_meter_installed' && !netMeterNumber.trim();
                return (
                  <Button
                    key={ns}
                    onClick={() => handleStatusUpdate(ns)}
                    disabled={updating || (ns === 'loan_process' && !loanBank.trim()) || needsWelder || needsElectrician || needsFileNumber || needsInspDate || needsMeterNum}
                    variant={ns === 'inspection_failed' ? 'destructive' : 'default'}
                    className={ns !== 'inspection_failed' ? 'gradient-primary text-primary-foreground' : ''}
                  >
                    {ns === 'inspection_failed' ? '✗ Inspection Failed' : `Move to: ${statusLabels[ns]}`}
                  </Button>
                );
              })}
            </div>
            {project.payment_type === 'loan' && nextStatuses.includes('loan_process' as ProjectStatus) && !loanBank.trim() && (
              <p className="text-xs text-destructive">Please enter bank name above before proceeding to loan stage</p>
            )}
            {nextStatuses.includes('installation_pending' as ProjectStatus) && !selectedWelder && (
              <p className="text-xs text-destructive">Please assign a welder above before moving to installation</p>
            )}
            {nextStatuses.includes('wiring_pending' as ProjectStatus) && !selectedElectrician && (
              <p className="text-xs text-destructive">Please assign an electrician above before moving to wiring</p>
            )}
            {nextStatuses.includes('net_metering_submitted' as ProjectStatus) && !netMeteringFileNumber.trim() && (
              <p className="text-xs text-destructive">Please enter file number above before submitting net metering</p>
            )}
            {nextStatuses.includes('inspection_scheduled' as ProjectStatus) && !inspectionDate && (
              <p className="text-xs text-destructive">Please select an inspection date above</p>
            )}
            {nextStatuses.includes('net_meter_installed' as ProjectStatus) && !netMeterNumber.trim() && (
              <p className="text-xs text-destructive">Please enter the net meter number above</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Status Timeline */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg">Project Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectTimeline currentStatus={project.status} paymentType={project.payment_type} />
        </CardContent>
      </Card>
    </div>
  );
};

const pipelineStages: { status: ProjectStatus; icon: React.ElementType; cashOnly?: boolean; loanOnly?: boolean }[] = [
  { status: 'pending_documents', icon: FileText },
  { status: 'pending_operator_review', icon: FileText },
  { status: 'registration_pending', icon: ClipboardCheck },
  { status: 'registration_done', icon: CheckCircle2 },
  { status: 'loan_process', icon: CreditCard, loanOnly: true },
  { status: 'loan_done', icon: CheckCircle2, loanOnly: true },
  { status: 'cash_file', icon: CreditCard, cashOnly: true },
  { status: 'material_ordered', icon: Package },
  { status: 'material_dispatched', icon: Truck },
  { status: 'material_delivered', icon: CheckCircle2 },
  { status: 'installation_pending', icon: Wrench },
  { status: 'installation_done', icon: CheckCircle2 },
  { status: 'wiring_pending', icon: Zap },
  { status: 'wiring_done', icon: CheckCircle2 },
  { status: 'net_metering_submitted', icon: ClipboardCheck },
  { status: 'inspection_scheduled', icon: FileText },
  { status: 'inspection_completed', icon: CheckCircle2 },
  { status: 'net_meter_installed', icon: Zap },
  { status: 'project_completed', icon: CheckCircle2 },
];

const ProjectTimeline = ({ currentStatus, paymentType }: { currentStatus: string; paymentType: string }) => {
  const stages = pipelineStages.filter(s => {
    if (s.loanOnly && paymentType !== 'loan') return false;
    if (s.cashOnly && paymentType !== 'cash') return false;
    return true;
  });

  const currentIdx = stages.findIndex(s => s.status === currentStatus);

  return (
    <div className="space-y-1">
      {stages.map((stage, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        const Icon = stage.icon;
        return (
          <div key={stage.status} className="flex items-center gap-3 py-1.5">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
              done ? 'bg-emerald-500 text-white' : active ? 'gradient-primary text-primary-foreground ring-2 ring-primary/30' : 'bg-muted text-muted-foreground'
            }`}>
              {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
            </div>
            <span className={`text-sm ${active ? 'font-bold text-foreground' : done ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
              {statusLabels[stage.status]}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default OperatorProjectDetail;
