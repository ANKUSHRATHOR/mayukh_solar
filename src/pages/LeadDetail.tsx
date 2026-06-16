import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, MapPin, Phone, Calendar, Clock, User,
  CheckCircle2, XCircle, Eye, FileText
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type LeadStatus = Database['public']['Enums']['lead_status'];
type CancellationReason = Database['public']['Enums']['cancellation_reason'];

const statusColor: Record<string, string> = {
  new: 'bg-info text-info-foreground',
  visited: 'bg-accent text-accent-foreground',
  follow_up: 'bg-warning text-warning-foreground',
  interested: 'bg-success text-success-foreground',
  not_interested: 'bg-destructive text-destructive-foreground',
  cancelled: 'bg-muted text-muted-foreground',
  final: 'bg-primary text-primary-foreground',
};

const statusLabel = (s: string) => s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

const cancellationReasons: { value: CancellationReason; label: string }[] = [
  { value: 'price_too_high', label: 'Price too high' },
  { value: 'already_installed', label: 'Already installed solar' },
  { value: 'not_interested_now', label: 'Not interested now' },
  { value: 'renting_property', label: 'Renting property — not owner' },
  { value: 'false_wrong_number', label: 'False or wrong number' },
  { value: 'duplicate_lead', label: 'Duplicate lead' },
  { value: 'other', label: 'Other' },
];

const LeadDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [lead, setLead] = useState<any>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Status update state
  const [showStatusUpdate, setShowStatusUpdate] = useState(false);
  const [newStatus, setNewStatus] = useState<LeadStatus | ''>('');
  const [visitNotes, setVisitNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [cancelReason, setCancelReason] = useState<CancellationReason | ''>('');
  const [cancelOther, setCancelOther] = useState('');
  const [updating, setUpdating] = useState(false);
  const [project, setProject] = useState<any>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const [salesPersons, setSalesPersons] = useState<{ user_id: string; full_name: string; mobile: string; email: string | null }[]>([]);
  const [assignedStaff, setAssignedStaff] = useState<{ user_id: string; full_name: string; mobile: string; email: string | null; role: string | null } | null>(null);
  const [reassignTarget, setReassignTarget] = useState<string>('');
  const [reassigning, setReassigning] = useState(false);
  const [people, setPeople] = useState<{ creator: any; assignee: any; history: any[] } | null>(null);

  const fetchLead = async () => {
    if (!id) return;
    setLoading(true);
    const { data: leadData } = await supabase.from('leads').select('*').eq('id', id).single();
    setLead(leadData);

    const [visitRes, projectRes, salesRes, peopleRes] = await Promise.all([
      supabase.from('site_visits').select('*').eq('lead_id', id).order('visit_date', { ascending: false }),
      supabase.from('projects').select('*').eq('lead_id', id).maybeSingle(),
      supabase.rpc('get_assignable_sales_persons'),
      supabase.rpc('get_lead_people' as any, { _lead_id: id }),
    ]);
    setVisits(visitRes.data || []);
    setProject(projectRes.data);
    const sales = (salesRes.data as any[]) || [];
    setSalesPersons(sales);
    setStaff(sales);

    const p = (peopleRes.data as any) || null;
    setPeople(p);
    if (p?.assignee) {
      setAssignedStaff({
        user_id: p.assignee.user_id,
        full_name: p.assignee.full_name,
        mobile: p.assignee.mobile,
        email: p.assignee.email,
        role: 'sales_person',
      });
      setReassignTarget(p.assignee.user_id);
    } else {
      setAssignedStaff(null);
      setReassignTarget('');
    }
    setLoading(false);
  };

  useEffect(() => { fetchLead(); }, [id]);

  const canUpdateStatus = role === 'admin' || role === 'sales_person';
  const canAssignSales = role === 'admin' || role === 'telecaller';

  const handleReassign = async () => {
    if (!reassignTarget || !lead) return;
    setReassigning(true);
    const { error } = await supabase
      .from('leads')
      .update({ assigned_to_user_id: reassignTarget })
      .eq('id', lead.id);
    if (error) {
      toast({ title: 'Reassignment failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Lead assigned', description: 'Sales person has been notified.' });
      fetchLead();
    }
    setReassigning(false);
  };

  const staffName = (userId: string | null) => {
    if (!userId) return 'Unknown user';
    if (people?.creator?.user_id === userId) return people.creator.full_name;
    if (people?.assignee?.user_id === userId) return people.assignee.full_name;
    return staff.find((s) => s.user_id === userId)?.full_name || 'Staff member';
  };

  const NEGATIVE_NOTE_MIN_WORDS = 100;
  const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  const isNegativeStatus = newStatus === 'cancelled' || newStatus === 'not_interested';

  const handleStatusUpdate = async () => {
    if (!newStatus || !lead || !user) return;

    // Validation
    if (isNegativeStatus && !cancelReason) {
      toast({ title: 'Reason required', description: 'Please select a reason', variant: 'destructive' });
      return;
    }
    if (cancelReason === 'other' && !cancelOther.trim()) {
      toast({ title: 'Please specify reason', variant: 'destructive' });
      return;
    }
    if (isNegativeStatus && wordCount(visitNotes) < NEGATIVE_NOTE_MIN_WORDS) {
      toast({
        title: 'Detailed note required',
        description: `Please write at least ${NEGATIVE_NOTE_MIN_WORDS} words explaining the cancellation/not interested reason. Currently: ${wordCount(visitNotes)} words.`,
        variant: 'destructive',
      });
      return;
    }
    if (newStatus === 'follow_up' && !followUpDate) {
      toast({ title: 'Follow-up date required', variant: 'destructive' });
      return;
    }

    setUpdating(true);
    try {
      const updateData: any = {
        status: newStatus,
        follow_up_date: newStatus === 'follow_up' ? followUpDate : null,
      };

      if (newStatus === 'cancelled') {
        updateData.is_in_bin = true;
        updateData.cancelled_reason = cancelReason;
        updateData.cancelled_reason_other = cancelReason === 'other' ? cancelOther : null;
      }
      if (newStatus === 'not_interested') {
        updateData.cancelled_reason = cancelReason;
        updateData.cancelled_reason_other = cancelReason === 'other' ? cancelOther : null;
      }

      // If status is 'final', redirect to project finalization form instead of updating here
      if (newStatus === 'final') {
        // Assign to self first if needed
        if (role === 'sales_person' && !lead.assigned_to_user_id) {
          await supabase.from('leads').update({ assigned_to_user_id: user.id }).eq('id', lead.id);
        }
        // Create site visit record if notes exist
        if (visitNotes.trim()) {
          await supabase.from('site_visits').insert({
            lead_id: lead.id,
            staff_id: user.id,
            visit_notes: visitNotes.trim(),
            status_updated_to: 'final',
          });
        }
        navigate(`/projects/new?leadId=${lead.id}`);
        return;
      }

      const { error } = await supabase.from('leads').update(updateData).eq('id', lead.id);
      if (error) throw error;

      // Create site visit record for visited status
      if (newStatus === 'visited' || visitNotes.trim()) {
        await supabase.from('site_visits').insert({
          lead_id: lead.id,
          staff_id: user.id,
          visit_notes: visitNotes.trim() || null,
          status_updated_to: newStatus,
        });
      }

      toast({ title: 'Status updated!', description: `Lead marked as ${statusLabel(newStatus)}` });
      setShowStatusUpdate(false);
      setNewStatus('');
      setVisitNotes('');
      setFollowUpDate('');
      setCancelReason('');
      setCancelOther('');
      fetchLead();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  if (!lead) return <div className="p-8 text-center text-muted-foreground">Lead not found</div>;

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      {/* Lead Header */}
      <Card className="shadow-elevated border-0">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-xl shrink-0">
                {lead.customer_name.charAt(0)}
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">{lead.customer_name}</h1>
                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {lead.mobile}</span>
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {lead.village_city}, {lead.district}</span>
                </div>
              </div>
            </div>
            <Badge className={`text-sm px-3 py-1 ${statusColor[lead.status] || ''}`}>
              {statusLabel(lead.status)}
            </Badge>
          </div>

          {/* Lead details */}
          <Separator className="my-4" />
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">State:</span> <span className="font-medium ml-1">{lead.state}</span></div>
            <div><span className="text-muted-foreground">Source:</span> <span className="font-medium ml-1">{statusLabel(lead.source)}</span></div>
            {lead.kw_interest && <div><span className="text-muted-foreground">Interest:</span> <span className="font-medium ml-1">{lead.kw_interest} kW</span></div>}
            {lead.reference_name && <div><span className="text-muted-foreground">Reference:</span> <span className="font-medium ml-1">{lead.reference_name}</span></div>}
            {lead.alt_mobile && <div><span className="text-muted-foreground">Alt Mobile:</span> <span className="font-medium ml-1">{lead.alt_mobile}</span></div>}
            <div className="col-span-2"><span className="text-muted-foreground">Address:</span> <span className="font-medium ml-1">{lead.address}</span></div>
            {lead.notes && <div className="col-span-2"><span className="text-muted-foreground">Notes:</span> <span className="font-medium ml-1">{lead.notes}</span></div>}
            <div><span className="text-muted-foreground">Created:</span> <span className="font-medium ml-1">{new Date(lead.created_at).toLocaleDateString()}</span></div>
            <div><span className="text-muted-foreground">Created By:</span> <span className="font-medium ml-1">{staffName(lead.created_by_user_id)}</span></div>
            {lead.assigned_to_user_id && <div><span className="text-muted-foreground">Assigned To:</span> <span className="font-medium ml-1">{staffName(lead.assigned_to_user_id)}</span></div>}
            {(lead.cancelled_reason || lead.cancelled_reason_other) && (
              <div className="col-span-2"><span className="text-muted-foreground">Cancel/Delete Reason:</span> <span className="font-medium ml-1 text-destructive">{lead.cancelled_reason_other || statusLabel(lead.cancelled_reason)}</span></div>
            )}
            {lead.follow_up_date && (
              <div>
                <span className="text-muted-foreground">Follow-up:</span>
                <span className={`font-medium ml-1 ${new Date(lead.follow_up_date) < new Date() ? 'text-destructive' : ''}`}>
                  {new Date(lead.follow_up_date).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Assigned Sales Person + Reassign */}
      {(canAssignSales || assignedStaff) && (
        <Card className="shadow-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> Assigned Sales Person
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {assignedStaff ? (
              <div className="rounded-lg border border-border bg-accent/30 p-3 space-y-1">
                <p className="font-semibold text-foreground">{assignedStaff.full_name}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" /> {assignedStaff.mobile}
                </p>
                {assignedStaff.email && (
                  <p className="text-sm text-muted-foreground">{assignedStaff.email}</p>
                )}
                {assignedStaff.role && (
                  <Badge variant="outline" className="mt-1 text-xs">{statusLabel(assignedStaff.role)}</Badge>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No sales person assigned yet.</p>
            )}

            {canAssignSales && lead.status !== 'cancelled' && lead.status !== 'final' && (
              <div className="space-y-2">
                <Label>{assignedStaff ? 'Reassign to' : 'Assign to sales person'}</Label>
                <div className="flex gap-2">
                  <Select value={reassignTarget} onValueChange={setReassignTarget}>
                    <SelectTrigger className="h-11 flex-1">
                      <SelectValue placeholder="Select sales person" />
                    </SelectTrigger>
                    <SelectContent>
                      {salesPersons.map(sp => (
                        <SelectItem key={sp.user_id} value={sp.user_id}>
                          {sp.full_name} — {sp.mobile}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleReassign}
                    disabled={reassigning || !reassignTarget || reassignTarget === lead.assigned_to_user_id}
                    className="gradient-primary text-primary-foreground font-semibold"
                  >
                    {reassigning ? 'Saving...' : (assignedStaff ? 'Reassign' : 'Assign')}
                  </Button>
                </div>
                {salesPersons.length === 0 && (
                  <p className="text-xs text-muted-foreground">No active sales persons available.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {people?.history && people.history.length > 0 && (
        <Card className="shadow-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Assignment History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {people.history.map((h: any) => (
                <div key={h.id} className="flex items-start gap-3 p-3 rounded-lg bg-accent/30">
                  <div className="mt-0.5 p-1.5 rounded-md bg-accent shrink-0">
                    <User className="h-3.5 w-3.5 text-accent-foreground" />
                  </div>
                  <div className="text-sm">
                    <p className="text-foreground">
                      <span className="font-medium">{h.from || 'Unassigned'}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className="font-medium">{h.to || 'Unassigned'}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      By {h.by || 'Unknown'} • {new Date(h.at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {project && (
        <Card className="shadow-card border-primary/20 bg-accent/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Project</p>
                <p className="text-lg font-bold text-foreground">{project.project_code}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{project.capacity_kw} kW • {project.panel_brand} • ₹{Number(project.final_amount).toLocaleString()}</p>
              </div>
              <Button onClick={() => navigate(`/projects/${project.id}/documents`)} className="gradient-primary text-primary-foreground font-semibold">
                <FileText className="mr-2 h-4 w-4" /> View Documents
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Update Status Button */}
      {canUpdateStatus && lead.status !== 'cancelled' && lead.status !== 'final' && (
        <div>
          {!showStatusUpdate ? (
            <Button onClick={() => setShowStatusUpdate(true)} className="gradient-primary text-primary-foreground font-semibold w-full h-12">
              Update Lead Status
            </Button>
          ) : (
            <Card className="shadow-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Update Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>New Status</Label>
                  <Select value={newStatus} onValueChange={v => setNewStatus(v as LeadStatus)}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="visited">Visited</SelectItem>
                      <SelectItem value="follow_up">Follow-up</SelectItem>
                      <SelectItem value="interested">Interested</SelectItem>
                      <SelectItem value="not_interested">Not Interested</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="final">Final (Deal Confirmed)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Visit Notes */}
                {(newStatus === 'visited' || newStatus === 'follow_up' || newStatus === 'interested' || newStatus === 'final') && (
                  <div className="space-y-1.5">
                    <Label>Visit / Status Notes</Label>
                    <Textarea value={visitNotes} onChange={e => setVisitNotes(e.target.value)} placeholder="Notes about this visit or update" rows={2} />
                  </div>
                )}

                {/* Follow-up Date */}
                {newStatus === 'follow_up' && (
                  <div className="space-y-1.5">
                    <Label>Follow-up Date *</Label>
                    <Input type="datetime-local" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} className="h-11" />
                  </div>
                )}

                {/* Cancellation Reason */}
                {(newStatus === 'cancelled' || newStatus === 'not_interested') && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Reason *</Label>
                      <Select value={cancelReason} onValueChange={v => setCancelReason(v as CancellationReason)}>
                        <SelectTrigger className="h-11"><SelectValue placeholder="Select reason" /></SelectTrigger>
                        <SelectContent>
                          {cancellationReasons.map(r => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {cancelReason === 'other' && (
                      <div className="space-y-1.5">
                        <Label>Specify Reason *</Label>
                        <Textarea value={cancelOther} onChange={e => setCancelOther(e.target.value)} placeholder="Describe the reason" rows={2} />
                      </div>
                    )}
                  </>
                )}

                <div className="flex gap-3">
                  <Button onClick={handleStatusUpdate} className="flex-1 gradient-primary text-primary-foreground font-semibold" disabled={updating || !newStatus}>
                    {updating ? 'Updating...' : 'Confirm Update'}
                  </Button>
                  <Button variant="outline" onClick={() => { setShowStatusUpdate(false); setNewStatus(''); }}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Site Visit History */}
      {visits.length > 0 && (
        <Card className="shadow-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Visit History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {visits.map(v => (
                <div key={v.id} className="flex items-start gap-3 p-3 rounded-lg bg-accent/30">
                  <div className="mt-0.5 p-1.5 rounded-md bg-accent shrink-0">
                    <Eye className="h-3.5 w-3.5 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Status → {v.status_updated_to ? statusLabel(v.status_updated_to) : 'Visit'}
                    </p>
                    {v.visit_notes && <p className="text-sm text-muted-foreground mt-0.5">{v.visit_notes}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{new Date(v.visit_date).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default LeadDetail;
