import { useEffect, useState, useCallback } from 'react';
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
  ClipboardCheck, CreditCard, Package, Truck, Wrench, Zap
} from 'lucide-react';
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

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const [projRes, docsRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('documents').select('*').eq('project_id', projectId),
    ]);

    const proj = projRes.data;
    setProject(proj);
    setDocs((docsRes.data as DocRecord[]) || []);
    setLoanBank(proj?.loan_bank || '');

    if (proj?.lead_id) {
      const { data: leadData } = await supabase.from('leads').select('*').eq('id', proj.lead_id).single();
      setLead(leadData);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
    setUpdating(true);
    const updates: any = { status: newStatus };

    // If moving to loan_process, save bank
    if (newStatus === 'loan_process' && loanBank) {
      updates.loan_bank = loanBank;
    }

    const { error } = await supabase.from('projects').update(updates).eq('id', projectId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Status Updated', description: `Project moved to ${statusLabels[newStatus]}` });

      // Log audit
      await supabase.from('audit_logs').insert({
        action: 'project_status_update',
        entity_type: 'project',
        entity_id: projectId,
        user_id: user?.id,
        old_value: { status: project.status },
        new_value: { status: newStatus },
      });
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">{project.project_code}</CardTitle>
            <Badge className="gradient-primary text-primary-foreground">{statusLabels[project.status as ProjectStatus]}</Badge>
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
            <div><p className="text-muted-foreground text-xs">Payment</p><p className="font-medium">{project.payment_type === 'loan' ? '🏦 Loan' : '💵 Cash'}</p></div>
            <div><p className="text-muted-foreground text-xs">Amount</p><p className="font-medium">₹{Number(project.final_amount).toLocaleString('en-IN')}</p></div>
            {project.loan_bank && <div><p className="text-muted-foreground text-xs">Loan Bank</p><p className="font-medium">{project.loan_bank}</p></div>}
          </div>
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
                    <Button variant="outline" size="sm" asChild>
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                        <Eye className="h-4 w-4 mr-1" /> View File
                      </a>
                    </Button>
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
              {nextStatuses.map(ns => (
                <Button
                  key={ns}
                  onClick={() => handleStatusUpdate(ns)}
                  disabled={updating || (ns === 'loan_process' && !loanBank.trim())}
                  className="gradient-primary text-primary-foreground"
                >
                  Move to: {statusLabels[ns]}
                </Button>
              ))}
            </div>
            {project.payment_type === 'loan' && nextStatuses.includes('loan_process' as ProjectStatus) && !loanBank.trim() && (
              <p className="text-xs text-destructive">Please enter bank name above before proceeding to loan stage</p>
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
