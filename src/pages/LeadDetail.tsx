import { useEffect, useState, useMemo } from 'react';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft, MapPin, Phone, Calendar, Clock, User,
  FileText, RefreshCw, Zap, MessageSquare,
  ChevronDown, ChevronUp, Activity, AlertTriangle, CheckCircle2,
  TrendingUp, Mail, MessageCircle, Edit
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { fetchConsumerDetails } from '@/lib/discom';
import { renderQuotationPdfBlob, downloadQuotationPdf } from '@/lib/quotationPdf';
import { sendQuotationNotification } from '@/lib/whatsapp';
import { calculateSubsidy, formatSubsidy, useSubsidySlabs } from '@/lib/subsidy';
import { leadStatusMeta, resolveStatus, toneClasses } from '@/lib/statusMeta';
import LeadVisitsPanel from '@/components/leads/LeadVisitsPanel';
import LeadDocumentsPanel from '@/components/leads/LeadDocumentsPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type LeadStatus = Database['public']['Enums']['lead_status'];
type CancellationReason = Database['public']['Enums']['cancellation_reason'];

const EVENT_ICON: Record<string, React.ReactNode> = {
  created:            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  assigned:           <User className="h-3.5 w-3.5 text-violet-500" />,
  visit_or_note:      <MessageSquare className="h-3.5 w-3.5 text-sky-500" />,
  quotation_sent:     <MessageCircle className="h-3.5 w-3.5 text-yellow-500" />,
  quotation_accepted: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
  quotation_rejected: <AlertTriangle className="h-3.5 w-3.5 text-red-500" />,
};

const statusLabel = (s: string | null | undefined) => {
  if (!s) return '—';
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const cancellationReasons: { value: CancellationReason; label: string }[] = [
  { value: 'price_too_high', label: 'Price too high' },
  { value: 'already_installed', label: 'Already installed solar' },
  { value: 'not_interested_now', label: 'Not interested now' },
  { value: 'renting_property', label: 'Renting property — not owner' },
  { value: 'false_wrong_number', label: 'False or wrong number' },
  { value: 'duplicate_lead', label: 'Duplicate lead' },
  { value: 'other', label: 'Other' },
];

/* ─── Section Wrapper ─── */
const Section = ({ title, icon, children, action, defaultOpen = true }: {
  title: string; icon: React.ReactNode; children: React.ReactNode;
  /** Section-level control (Edit, Sync). Sits in the header, outside the toggle. */
  action?: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      {/* The action lives in the header rather than floating above the content on
          a negative margin, and stays outside the toggle so it isn't a nested
          button. */}
      <div className="flex items-center gap-2 px-5 py-3.5">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="-m-1 flex min-w-0 flex-1 items-center gap-2.5 rounded p-1 text-left text-sm font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <span className="shrink-0 text-primary">{icon}</span>
          <span className="truncate">{title}</span>
          {open
            ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </button>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {open && <div className="border-t border-border/50">{children}</div>}
    </div>
  );
};

/* ─── Info Row ─── */
const InfoRow = ({ label, value, mono = false, href }: { label: string; value?: string | null; mono?: boolean; href?: string }) => (
  <div className="flex flex-col gap-0.5">
    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
    {href ? (
      <a href={href} className={`font-semibold text-primary hover:underline text-sm ${mono ? 'font-mono tracking-wider' : ''}`}>
        {value || '—'}
      </a>
    ) : (
      <p className={`font-semibold text-foreground text-sm ${mono ? 'font-mono tracking-wider' : ''}`}>{value || '—'}</p>
    )}
  </div>
);

/* ────────────────────────────── Main Component ──────────────────────────────── */
const LeadDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const subsidySlabs = useSubsidySlabs();

  const [lead, setLead] = useState<any>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [allStaff, setAllStaff] = useState<any[]>([]);
  const [vendorProfile, setVendorProfile] = useState<any>(null);

  // Dialog open states
  const [isCallLogOpen, setIsCallLogOpen] = useState(false);
  const [isBookVisitOpen, setIsBookVisitOpen] = useState(false);
  const [isStatusUpdateOpen, setIsStatusUpdateOpen] = useState(false);
  const [isPlantDetailsOpen, setIsPlantDetailsOpen] = useState(false);
  const [isCreateQuoteOpen, setIsCreateQuoteOpen] = useState(false);
  const [isQuotationPreviewOpen, setIsQuotationPreviewOpen] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Edit contact details state
  const [isEditContactOpen, setIsEditContactOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editAltMobile, setEditAltMobile] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editVillageCity, setEditVillageCity] = useState('');
  const [editDistrict, setEditDistrict] = useState('');
  const [editState, setEditState] = useState('');

  // WhatsApp phone prompt state
  const [isPhonePromptOpen, setIsPhonePromptOpen] = useState(false);
  const [targetPhone, setTargetPhone] = useState('');

  // Call log state
  const [callNotes, setCallNotes] = useState('');
  const [callStatus, setCallStatus] = useState<LeadStatus | ''>('');
  const [callFollowUpDate, setCallFollowUpDate] = useState('');
  const [loggingCall, setLoggingCall] = useState(false);

  // Appointment state
  const [apptDate, setApptDate] = useState('');
  const [apptSalesId, setApptSalesId] = useState('');
  const [apptNotes, setApptNotes] = useState('');
  const [bookingAppt, setBookingAppt] = useState(false);

  // Status update state
  const [newStatus, setNewStatus] = useState<LeadStatus | ''>('');
  const [visitNotes, setVisitNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [cancelReason, setCancelReason] = useState<CancellationReason | ''>('');
  const [cancelOther, setCancelOther] = useState('');
  const [updating, setUpdating] = useState(false);
  const [syncingKno, setSyncingKno] = useState(false);
  const [knoInput, setKnoInput] = useState('');

  // Configured Dropdowns
  const [dropdownOptions, setDropdownOptions] = useState<any>({
    phase: ["Single Phase", "Three Phase"],
    panel_make: ["Tata Power", "Adani Solar", "Waaree", "Vikram Solar", "Loom Solar"],
    panel_wt: ["540W", "550W", "575W", "600W"],
    inverter: ["Growatt", "Sofar", "Sungrow", "Solis", "Luminous"],
    inverter_wt: ["3 kW", "5 kW", "8 kW", "10 kW", "15 kW", "20 kW"],
    wiremake: ["Polycab", "Havells", "KEI", "Finolex"],
    wire_size: ["4 sqmm", "6 sqmm", "10 sqmm", "16 sqmm"],
    wire_material: ["Copper", "Aluminum"]
  });

  // Plant Details input states
  const [plantPhase, setPlantPhase] = useState('');
  const [plantPanelMake, setPlantPanelMake] = useState('');
  const [plantPanelWt, setPlantPanelWt] = useState('');
  const [plantInverter, setPlantInverter] = useState('');
  const [plantInverterWt, setPlantInverterWt] = useState('');
  const [plantWiremake, setPlantWiremake] = useState('');
  const [plantWireSize, setPlantWireSize] = useState('');
  const [plantWireMaterial, setPlantWireMaterial] = useState('');
  const [plantTotalCost, setPlantTotalCost] = useState('');
  const [plantSubsidy, setPlantSubsidy] = useState(false);

  // Quotation Price state
  const [quotePrice, setQuotePrice] = useState('');
  const [quoteCapacity, setQuoteCapacity] = useState('');
  const [quotePhase, setQuotePhase] = useState('');
  const [quotePanelBrand, setQuotePanelBrand] = useState('');
  const [quotePanelWatt, setQuotePanelWatt] = useState('');
  const [quotePanelQty, setQuotePanelQty] = useState('');
  const [quoteInverterBrand, setQuoteInverterBrand] = useState('');
  const [quoteInverterCapacity, setQuoteInverterCapacity] = useState('');
  const [quoteStructureType, setQuoteStructureType] = useState('');
  const [quoteTotalCost, setQuoteTotalCost] = useState('');
  const [quoteSubsidy, setQuoteSubsidy] = useState(false);
  const [quoteSubsidyAmount, setQuoteSubsidyAmount] = useState('');
  const [quoteName, setQuoteName] = useState('');
  const [editingQuoteIndex, setEditingQuoteIndex] = useState<number | null>(null);
  const [selectedPreviewQuote, setSelectedPreviewQuote] = useState<any | null>(null);

  // PM Surya Ghar subsidy is slab-based by capacity, not a flat amount.
  // The plant dialog has no capacity field of its own, so it keys off the lead.
  const plantSubsidyAmount = useMemo(
    () => calculateSubsidy(lead?.kw_interest, subsidySlabs),
    [lead?.kw_interest, subsidySlabs]
  );
  const quoteDefaultSubsidy = useMemo(
    () => calculateSubsidy(quoteCapacity, subsidySlabs),
    [quoteCapacity, subsidySlabs]
  );

  const [project, setProject] = useState<any>(null);
  const [salesPersons, setSalesPersons] = useState<{ user_id: string; full_name: string; mobile: string; email: string | null }[]>([]);
  const [people, setPeople] = useState<{ creator: any; assignee: any; history: any[] } | null>(null);

  const fetchLead = async () => {
    if (!id) return;
    setLoading(true);
    const { data: leadData } = await supabase.from('leads').select('*').eq('id', id).single();
    setLead(leadData);

    const [visitRes, projectRes, salesRes, peopleRes, allStaffRes, configRes, vendorRes] = await Promise.all([
      supabase.from('site_visits').select('*').eq('lead_id', id).order('visit_date', { ascending: false }),
      supabase.from('projects').select('*').eq('lead_id', id).maybeSingle(),
      supabase.rpc('get_assignable_sales_persons'),
      supabase.rpc('get_lead_people' as any, { _lead_id: id }),
      supabase.from('staff').select('user_id, full_name'),
      supabase.from('system_configs' as any).select('value').eq('key', 'plant_details_dropdown_options').maybeSingle(),
      supabase.from('vendor_profiles' as any).select('*').eq('is_default', true).maybeSingle(),
    ]);
    setVisits(visitRes.data || []);
    setProject(projectRes.data);
    const sales = (salesRes.data as any[]) || [];
    setSalesPersons(sales);
    setAllStaff(allStaffRes.data || []);

    if (configRes.data && (configRes.data as any).value) {
      setDropdownOptions((configRes.data as any).value);
    }
    if (vendorRes.data) {
      setVendorProfile(vendorRes.data);
    }

    const p = (peopleRes.data as any) || null;
    setPeople(p);

    // Fetch audit_logs for this lead to show in activity timeline
    const { data: auditData } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('entity_type', 'lead')
      .eq('entity_id', id)
      .order('created_at', { ascending: false });
    setAuditLogs(auditData || []);

    setLoading(false);
  };

  useEffect(() => { fetchLead(); }, [id]);

  useEffect(() => {
    if (lead) {
      if (lead.plant_details) {
        const pd = lead.plant_details as any;
        setPlantPhase(pd.phase || '');
        setPlantPanelMake(pd.panel_make || '');
        setPlantPanelWt(pd.panel_wt || '');
        setPlantInverter(pd.inverter || '');
        setPlantInverterWt(pd.inverter_wt || '');
        setPlantWiremake(pd.wiremake || '');
        setPlantWireSize(pd.wire_size || '');
        setPlantWireMaterial(pd.wire_material || '');
        setPlantTotalCost(pd.total_cost ? String(pd.total_cost) : '');
        setPlantSubsidy(!!pd.subsidy);
      } else {
        setPlantPhase('');
        setPlantPanelMake('');
        setPlantPanelWt('');
        setPlantInverter('');
        setPlantInverterWt('');
        setPlantWiremake('');
        setPlantWireSize('');
        setPlantWireMaterial('');
        setPlantTotalCost('');
        setPlantSubsidy(false);
      }
    }
  }, [lead]);

  useEffect(() => {
    if (isCreateQuoteOpen) {
      const turnkey = Number(quoteTotalCost) || 0;
      const sub = quoteSubsidy ? (Number(quoteSubsidyAmount) || quoteDefaultSubsidy) : 0;
      setQuotePrice(String(Math.max(0, turnkey - sub) || ''));
    }
  }, [quoteTotalCost, quoteSubsidy, quoteSubsidyAmount, quoteDefaultSubsidy, isCreateQuoteOpen]);

  const canUpdateStatus = role === 'admin' || role === 'sales_person' || role === 'telecaller';

  // Memoised so LeadVisitsPanel isn't handed a fresh object every render.
  const staffNameMap = useMemo(
    () => Object.fromEntries(allStaff.map((s: any) => [s.user_id, s.full_name])),
    [allStaff]
  );

  const staffName = (userId: string | null) => {
    if (!userId) return 'Unknown User';
    if (userId === user?.id) return 'You';
    return allStaff.find((s) => s.user_id === userId)?.full_name || 'Staff Member';
  };

  /** Fetches Discom consumer data for a K-Number and writes it onto the lead. */
  const runKnoSync = async (kno: string) => {
    if (!lead) return;
    setSyncingKno(true);
    try {
      const response = await fetchConsumerDetails(kno);
      if (response && response.ok && response.data && response.data.KNO) {
        const knoData = response.data.KNO;
        const { error } = await supabase.from('leads').update({
          kno_details: knoData,
          latitude: knoData.latitude ? parseFloat(String(knoData.latitude)) : null,
          longitude: knoData.longitude ? parseFloat(String(knoData.longitude)) : null,
          kw_interest: knoData.solarloadkw ? parseFloat(String(knoData.solarloadkw)) : (knoData.connload ? parseFloat(String(knoData.connload)) : null)
        }).eq('id', lead.id);
        if (error) throw error;
        toast({ title: 'Discom Details Synced!', description: `Loaded name: ${knoData.name || 'N/A'}` });
        fetchLead();
      } else {
        toast({ title: 'Sync Failed', description: 'Could not fetch details for this K-Number.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Sync Failed', description: err.message || 'Error occurred.', variant: 'destructive' });
    } finally {
      setSyncingKno(false);
    }
  };

  const handleSyncKno = () => {
    if (!lead || !lead.k_number || lead.k_number.length !== 12) return;
    void runKnoSync(lead.k_number);
  };

  /** Saves a K-Number onto a lead that had none, then syncs it from Discom. */
  const handleAddKno = async () => {
    if (!lead) return;
    const kno = knoInput.trim();
    if (!/^\d{12}$/.test(kno)) {
      toast({ title: 'Invalid K-Number', description: 'Enter the 12-digit K-Number from the electricity bill.', variant: 'destructive' });
      return;
    }
    setSyncingKno(true);
    const { error } = await supabase.from('leads').update({ k_number: kno }).eq('id', lead.id);
    if (error) {
      toast({ title: 'Failed to save K-Number', description: error.message, variant: 'destructive' });
      setSyncingKno(false);
      return;
    }
    setKnoInput('');
    // runKnoSync manages the syncing flag from here.
    await runKnoSync(kno);
  };

  const handleLogCall = async () => {
    if (!callNotes.trim() || !lead || !user) {
      toast({ title: 'Comment required', description: 'Please enter call comments.', variant: 'destructive' });
      return;
    }
    // A follow-up must have a date — it becomes the task's due date.
    if (callStatus === 'follow_up' && !callFollowUpDate) {
      toast({ title: 'Follow-up date required', description: 'Pick the date to follow up on.', variant: 'destructive' });
      return;
    }
    setLoggingCall(true);
    try {
      const { error: visitErr } = await supabase.from('site_visits').insert({
        lead_id: lead.id,
        staff_id: user.id,
        visit_notes: `[Call Log] ${callNotes.trim()}`,
        status_updated_to: callStatus || null,
      });
      if (visitErr) throw visitErr;
      if (callStatus) {
        const leadUpdate: any = { status: callStatus };
        if (callStatus === 'follow_up') leadUpdate.follow_up_date = callFollowUpDate;
        const { error: leadErr } = await supabase.from('leads').update(leadUpdate).eq('id', lead.id);
        if (leadErr) throw leadErr;
      }
      // A follow-up creates a task for the lead's assignee, due on the
      // follow-up date. The RPC is SECURITY DEFINER so non-admin callers
      // (telecaller/sales) can create it despite the tasks INSERT policy.
      if (callStatus === 'follow_up') {
        const { error: taskErr } = await supabase.rpc('create_lead_followup_task' as any, {
          _lead_id: lead.id,
          _due_date: callFollowUpDate,
          _notes: callNotes.trim(),
        });
        if (taskErr) throw taskErr;
      }
      toast({ title: callStatus === 'follow_up' ? 'Call logged & follow-up task created!' : 'Call log added!' });
      setCallNotes(''); setCallStatus(''); setCallFollowUpDate('');
      setIsCallLogOpen(false);
      fetchLead();
    } catch (err: any) {
      toast({ title: 'Failed to log call', description: err.message, variant: 'destructive' });
    } finally {
      setLoggingCall(false);
    }
  };

  const handleBookAppointment = async () => {
    if (!apptDate || !lead || !user) {
      toast({ title: 'Date required', description: 'Please select an appointment date & time.', variant: 'destructive' });
      return;
    }
    setBookingAppt(true);
    try {
      const { error: leadErr } = await supabase.from('leads').update({
        follow_up_date: apptDate,
        assigned_to_user_id: apptSalesId || null,
        status: 'visit_created'
      }).eq('id', lead.id);
      if (leadErr) throw leadErr;

      const formattedApptDate = new Date(apptDate).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      // Written as a real scheduled visit, not a note. Before this it was
      // indistinguishable from a call log, so a booked visit was invisible on
      // the lead page and there was nothing to mark complete.
      const { error: visitErr } = await supabase.from('site_visits').insert({
        lead_id: lead.id,
        staff_id: user.id,
        assigned_to_user_id: apptSalesId || null,
        visit_status: 'scheduled',
        scheduled_for: apptDate,
        visit_date: apptDate,
        visit_notes: apptNotes.trim() || null,
        status_updated_to: 'visit_created',
      } as any);
      if (visitErr) throw visitErr;
      void formattedApptDate;
      toast({ title: 'Appointment Booked!', description: apptSalesId ? 'Sales person assigned.' : 'Visit open for claiming.' });
      setApptDate(''); setApptSalesId(''); setApptNotes('');
      setIsBookVisitOpen(false);
      fetchLead();
    } catch (err: any) {
      toast({ title: 'Booking failed', description: err.message, variant: 'destructive' });
    } finally {
      setBookingAppt(false);
    }
  };

  const handleSavePlantDetails = async () => {
    if (!lead) return;
    try {
      const subsidyAmt = plantSubsidy ? plantSubsidyAmount : 0;
      const totalCostNum = Number(plantTotalCost) || 0;
      const netCostNum = Math.max(0, totalCostNum - subsidyAmt);

      const plantObj = {
        phase: plantPhase,
        panel_make: plantPanelMake,
        panel_wt: plantPanelWt,
        inverter: plantInverter,
        inverter_wt: plantInverterWt,
        wiremake: plantWiremake,
        wire_size: plantWireSize,
        wire_material: plantWireMaterial,
        total_cost: totalCostNum,
        subsidy: plantSubsidy,
        subsidy_amount: subsidyAmt,
        net_cost: netCostNum
      };

      const { data, error } = await supabase
        .from('leads')
        .update({ plant_details: plantObj })
        .eq('id', lead.id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ 
          title: 'Permission Denied', 
          description: 'No rows were updated. You might not have authorization to edit this lead under Row Level Security.', 
          variant: 'destructive' 
        });
        return;
      }

      toast({ title: 'Plant details saved successfully!' });
      setIsPlantDetailsOpen(false);
      fetchLead();
    } catch (e: any) {
      toast({ title: 'Failed to save plant details', description: e.message, variant: 'destructive' });
    }
  };

  const handleOpenCreateQuote = (index: number | null = null) => {
    const quotes = Array.isArray(lead?.quotation_details)
      ? lead.quotation_details
      : lead?.quotation_details && typeof lead.quotation_details === 'object'
      ? [lead.quotation_details]
      : [];

    if (index !== null && quotes[index]) {
      const q = quotes[index] as any;
      setEditingQuoteIndex(index);
      setQuoteName(q.name || '');
      setQuotePrice(String(q.quote_price || ''));
      setQuoteCapacity(String(q.capacity_kw || ''));
      setQuotePhase(q.phase || '');
      setQuotePanelBrand(q.panel_brand || '');
      setQuotePanelWatt(q.panel_watt ? String(q.panel_watt) : '');
      setQuotePanelQty(q.panel_qty ? String(q.panel_qty) : '');
      setQuoteInverterBrand(q.inverter_brand || '');
      setQuoteInverterCapacity(q.inverter_capacity ? String(q.inverter_capacity) : '');
      setQuoteStructureType(q.structure_type || '');
      setQuoteTotalCost(q.total_cost ? String(q.total_cost) : '');
      setQuoteSubsidy(!!q.subsidy_amount);
      setQuoteSubsidyAmount(q.subsidy_amount ? String(q.subsidy_amount) : '');
    } else {
      setEditingQuoteIndex(null);
      const pd = (lead?.plant_details as any) || {};
      const nextIndex = quotes.length + 1;
      const idxStr = String(nextIndex).padStart(2, '0');
      const cap = pd.required_capacity || lead?.kw_interest || '';
      
      setQuoteCapacity(String(cap));
      setQuotePhase(pd.phase || '');
      setQuotePanelBrand(pd.panel_make || '');
      setQuotePanelWatt(pd.panel_wt ? String(pd.panel_wt).replace(/\D/g, '') : '');
      setQuotePanelQty(pd.panel_qty ? String(pd.panel_qty) : '');
      setQuoteInverterBrand(pd.inverter || '');
      setQuoteInverterCapacity(pd.inverter_wt ? String(pd.inverter_wt).replace(/\D/g, '') : '');
      setQuoteStructureType(pd.structure_type_gauge_make || '');
      setQuoteTotalCost(pd.total_cost ? String(pd.total_cost) : '');
      setQuoteSubsidy(!!pd.subsidy);
      setQuoteSubsidyAmount(
        pd.subsidy ? String(pd.subsidy_amount || calculateSubsidy(cap, subsidySlabs)) : ''
      );

      const capStr = cap ? `${cap}kW` : '3kW';
      setQuoteName(`${lead?.customer_name || 'Client'} - ${idxStr} - ${capStr}`);
      
      const turnkey = Number(pd.total_cost) || 0;
      const sub = pd.subsidy ? (Number(pd.subsidy_amount) || calculateSubsidy(cap, subsidySlabs)) : 0;
      setQuotePrice(String(Math.max(0, turnkey - sub) || ''));
    }
    setIsCreateQuoteOpen(true);
  };

  const handleCreateQuotation = async () => {
    if (!lead || !user) return;
    const priceNum = Number(quotePrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      toast({ title: 'Invalid price', description: 'Please enter a valid price.', variant: 'destructive' });
      return;
    }

    try {
      const staffNameVal = staffName(user.id);
      
      const quotes = Array.isArray(lead.quotation_details)
        ? [...lead.quotation_details]
        : lead.quotation_details && typeof lead.quotation_details === 'object'
        ? [lead.quotation_details]
        : [];

      let quoteNo = '';
      if (editingQuoteIndex !== null && quotes[editingQuoteIndex]) {
        quoteNo = (quotes[editingQuoteIndex] as any).quotation_number;
      } else {
        const baseNo = `MS-Q-${Math.floor(100000 + Math.random() * 900000)}`;
        const idxStr = String(quotes.length + 1).padStart(2, '0');
        quoteNo = `${baseNo}-${idxStr}`;
      }

      const quoteObj = {
        quotation_number: quoteNo,
        name: quoteName.trim() || `${lead.customer_name} - ${quoteNo}`,
        capacity_kw: Number(quoteCapacity) || null,
        phase: quotePhase || null,
        panel_brand: quotePanelBrand || null,
        panel_watt: Number(quotePanelWatt) || null,
        panel_qty: Number(quotePanelQty) || null,
        inverter_brand: quoteInverterBrand || null,
        inverter_capacity: Number(quoteInverterCapacity) || null,
        structure_type: quoteStructureType || null,
        total_cost: Number(quoteTotalCost) || null,
        subsidy_amount: quoteSubsidy ? (Number(quoteSubsidyAmount) || quoteDefaultSubsidy) : 0,
        net_cost: (Number(quoteTotalCost) || 0) - (quoteSubsidy ? (Number(quoteSubsidyAmount) || quoteDefaultSubsidy) : 0),
        quote_price: priceNum,
        status: editingQuoteIndex !== null ? (quotes[editingQuoteIndex] as any).status : 'pending',
        created_at: editingQuoteIndex !== null ? (quotes[editingQuoteIndex] as any).created_at : new Date().toISOString(),
        created_by: editingQuoteIndex !== null ? (quotes[editingQuoteIndex] as any).created_by : staffNameVal,
        updated_at: new Date().toISOString(),
      };

      if (editingQuoteIndex !== null) {
        quotes[editingQuoteIndex] = quoteObj;
      } else {
        quotes.push(quoteObj);
      }

      const { data, error } = await supabase
        .from('leads')
        .update({ quotation_details: quotes })
        .eq('id', lead.id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ 
          title: 'Permission Denied', 
          description: 'No rows were updated under Row Level Security.', 
          variant: 'destructive' 
        });
        return;
      }

      toast({ 
        title: editingQuoteIndex !== null ? 'Quotation updated successfully!' : 'Quotation generated successfully!', 
        description: `Quotation No: ${quoteNo}` 
      });
      setIsCreateQuoteOpen(false);
      setQuotePrice('');
      fetchLead();
    } catch (e: any) {
      toast({ title: 'Failed to create quotation', description: e.message, variant: 'destructive' });
    }
  };

  /**
   * Creates a quotation straight from the lead's plant details — no form.
   *
   * A quotation is just the plant specs and pricing already captured under
   * "Plant Details", so re-asking for them in a dialog was redundant. This
   * validates that the fields a quotation needs are present, names the ones
   * that aren't, and otherwise runs the same save as the manual flow.
   */
  const handleCreateQuotationFromPlant = async () => {
    if (!lead || !user) return;

    const pd = (lead.plant_details as any) || {};
    const capacity = Number(pd.required_capacity || lead.kw_interest || 0);
    const panelWatt = Number(String(pd.panel_wt || '').replace(/\D/g, '')) || 0;
    const totalCost = Number(pd.total_cost) || 0;

    // Every field a quotation document needs, with the label the user sees.
    const missing: string[] = [];
    if (!capacity) missing.push('Interested Capacity');
    if (!pd.phase) missing.push('Phase');
    if (!pd.panel_make) missing.push('Panel Make');
    if (!panelWatt) missing.push('Panel Wattage');
    if (!pd.inverter) missing.push('Inverter Make');
    if (!totalCost) missing.push('Total Cost');

    if (missing.length > 0) {
      const hasAnyPlant = Object.keys(pd).length > 0;
      toast({
        title: 'Fill plant details before quoting',
        description: `${hasAnyPlant ? 'Missing' : 'Add plant details first — missing'}: ${missing.join(', ')}. Use ${hasAnyPlant ? 'Edit' : 'Add'} Plant Details above.`,
        variant: 'destructive',
        duration: 10000,
      });
      return;
    }

    try {
      const quotes = Array.isArray(lead.quotation_details)
        ? [...lead.quotation_details]
        : lead.quotation_details && typeof lead.quotation_details === 'object'
        ? [lead.quotation_details]
        : [];

      const idxStr = String(quotes.length + 1).padStart(2, '0');
      const quoteNo = `MS-Q-${Math.floor(100000 + Math.random() * 900000)}-${idxStr}`;
      const panelQty = Math.ceil((capacity * 1000) / panelWatt);
      const subsidyAmt = pd.subsidy
        ? Number(pd.subsidy_amount) || calculateSubsidy(capacity, subsidySlabs)
        : 0;
      const netCost = Math.max(0, totalCost - subsidyAmt);

      const quoteObj = {
        quotation_number: quoteNo,
        name: `${lead.customer_name} - ${idxStr} - ${capacity}kW`,
        capacity_kw: capacity,
        phase: pd.phase || null,
        panel_brand: pd.panel_make || null,
        panel_watt: panelWatt || null,
        panel_qty: panelQty || null,
        inverter_brand: pd.inverter || null,
        inverter_capacity: Number(String(pd.inverter_wt || '').replace(/\D/g, '')) || null,
        structure_type: pd.structure_type_gauge_make || null,
        total_cost: totalCost,
        subsidy_amount: subsidyAmt,
        net_cost: netCost,
        quote_price: netCost,
        status: 'pending',
        created_at: new Date().toISOString(),
        created_by: staffName(user.id),
        updated_at: new Date().toISOString(),
      };

      quotes.push(quoteObj);

      const { data, error } = await supabase
        .from('leads')
        .update({ quotation_details: quotes })
        .eq('id', lead.id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        toast({
          title: 'Permission Denied',
          description: 'No rows were updated under Row Level Security.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Quotation generated',
        description: `${quoteNo} — ₹${netCost.toLocaleString('en-IN')} after subsidy. Send it from the row menu.`,
      });
      fetchLead();
    } catch (e: any) {
      toast({ title: 'Failed to create quotation', description: e.message, variant: 'destructive' });
    }
  };

  const handleDeleteQuotation = async (index: number) => {
    if (!lead || !Array.isArray(lead.quotation_details)) return;
    if (!confirm('Are you sure you want to delete this quotation?')) return;

    try {
      const quotes = [...lead.quotation_details];
      quotes.splice(index, 1);

      const { error } = await supabase
        .from('leads')
        .update({ quotation_details: quotes })
        .eq('id', lead.id);

      if (error) throw error;
      toast({ title: 'Quotation deleted successfully' });
      fetchLead();
    } catch (e: any) {
      toast({ title: 'Failed to delete quotation', description: e.message, variant: 'destructive' });
    }
  };

  const handleDownloadPDF = () => {
    const q = selectedPreviewQuote;
    const element = document.getElementById('print-quotation-area');
    if (!element || !q) return;

    downloadQuotationPdf(element, q.quotation_number);
  };

  const handleSendQuotationWhatsApp = async (quoteToSent: any = null, phoneOverride?: string) => {
    const q = quoteToSent || selectedPreviewQuote;
    if (!lead || !q) return;

    if (!phoneOverride) {
      setSelectedPreviewQuote(q);
      setTargetPhone(lead.mobile || '');
      setIsPhonePromptOpen(true);
      return;
    }

    setSendingWhatsApp(true);

    try {
      setSelectedPreviewQuote(q);
      await new Promise(resolve => setTimeout(resolve, 300));

      const element = document.getElementById('print-quotation-area');
      if (!element) throw new Error('Quotation preview element not found.');

      // 1. Generate PDF Blob client-side
      const pdfBlob = await renderQuotationPdfBlob(element, q.quotation_number);

      // 2. Upload PDF to Supabase Storage
      const filePath = `quotations/${lead.id}/Quotation_${q.quotation_number}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(filePath, pdfBlob, { contentType: 'application/pdf', upsert: true });

      if (uploadError) throw uploadError;

      // 3. Create signed URL
      const { data: signedData, error: signedError } = await supabase.storage
        .from('project-documents')
        .createSignedUrl(filePath, 60 * 60 * 24 * 7);

      if (signedError) throw signedError;
      const quotePdfUrl = signedData?.signedUrl;

      // 4. Send WhatsApp message
      const res = await sendQuotationNotification(
        lead.customer_name,
        phoneOverride,
        q.quotation_number,
        q.quote_price,
        q.capacity_kw ? `${q.capacity_kw} kW` : 'Solar Power',
        quotePdfUrl
      );

      if (res.success) {
        toast({ title: 'Quotation with PDF attachment sent on WhatsApp successfully!' });

        const quotes = Array.isArray(lead.quotation_details)
          ? [...lead.quotation_details]
          : lead.quotation_details && typeof lead.quotation_details === 'object'
          ? [lead.quotation_details]
          : [];

        const updatedQuotes = quotes.map((item: any) => {
          if (item.quotation_number === q.quotation_number) {
            return { ...item, status: 'sent', updated_at: new Date().toISOString() };
          }
          return item;
        });

        // Auto-update lead status to 'quotation_sent'
        await supabase.from('leads').update({ 
          status: 'quotation_sent' as any,
          quotation_details: updatedQuotes
        }).eq('id', lead.id);

        // Log to audit_logs
        await supabase.from('audit_logs').insert({
          action: 'quotation_sent',
          entity_type: 'lead',
          entity_id: lead.id,
          new_value: { quotation_number: q.quotation_number, sent_to: phoneOverride }
        } as any);

        await fetchLead();
      } else {
        toast({ title: 'Failed to send WhatsApp', description: res.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Failed to send PDF on WhatsApp', description: err.message, variant: 'destructive' });
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const handleOpenEditContact = () => {
    if (!lead) return;
    setEditName(lead.customer_name || '');
    setEditMobile(lead.mobile || '');
    setEditAltMobile(lead.alt_mobile || '');
    setEditEmail(lead.email || '');
    setEditAddress(lead.address || '');
    setEditVillageCity(lead.village_city || '');
    setEditDistrict(lead.district || '');
    setEditState(lead.state || '');
    setIsEditContactOpen(true);
  };

  const handleSaveContactDetails = async () => {
    if (!lead) return;
    if (!editName.trim() || !editMobile.trim()) {
      toast({ title: 'Validation error', description: 'Name and mobile number are required.', variant: 'destructive' });
      return;
    }
    try {
      const { data, error } = await supabase
        .from('leads')
        .update({
          customer_name: editName.trim(),
          mobile: editMobile.trim(),
          alt_mobile: editAltMobile.trim() || null,
          email: editEmail.trim() || null,
          address: editAddress.trim() || null,
          village_city: editVillageCity.trim() || null,
          district: editDistrict.trim() || null,
          state: editState.trim() || null
        })
        .eq('id', lead.id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ title: 'Permission Denied', description: 'No rows were updated. You might not have authorization to edit this lead.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Contact details saved successfully!' });
      setIsEditContactOpen(false);
      fetchLead();
    } catch (e: any) {
      toast({ title: 'Failed to save contact details', description: e.message, variant: 'destructive' });
    }
  };

  const timelineEvents = useMemo(() => {
    if (!lead) return [];
    const events: any[] = [];
    events.push({
      id: 'creation', type: 'created',
      date: new Date(lead.created_at),
      title: 'Lead Created',
      content: `Lead created for customer ${lead.customer_name}`,
      by: staffName(lead.created_by_user_id),
    });
    if (people?.history) {
      people.history.forEach((h: any, idx: number) => {
        events.push({
          id: `assignment-${idx}`, type: 'assigned',
          date: new Date(h.at),
          title: 'Lead Reassigned',
          content: `Assigned: ${h.from || 'Unassigned'} → ${h.to || 'Unassigned'}`,
          by: h.by || 'System',
        });
      });
    }
    visits.forEach((v: any) => {
      events.push({
        id: `visit-${v.id}`, type: 'visit_or_note',
        date: new Date(v.visit_date),
        title: v.status_updated_to ? `Status → ${statusLabel(v.status_updated_to)}` : 'Note Logged',
        content: v.visit_notes,
        by: staffName(v.staff_id),
      });
    });
    // Include audit log entries (quotation_sent, quotation_accepted, quotation_rejected)
    auditLogs.forEach((log: any, idx: number) => {
      const actionLabel: Record<string, string> = {
        quotation_sent:     'Quotation Sent via WhatsApp',
        quotation_accepted: 'Quotation Accepted by Customer',
        quotation_rejected: 'Quotation Rejected by Customer',
      };
      const actionContent: Record<string, (l: any) => string> = {
        quotation_sent: (l) => `Quotation ${l.new_value?.quotation_number || ''} sent to ${l.new_value?.sent_to || 'customer'} via WhatsApp.`,
        quotation_accepted: (l) => `Customer replied: "${l.new_value?.message || 'CONFIRM'}"`,
        quotation_rejected: (l) => `Customer replied: "${l.new_value?.message || 'REJECT'}"`,
      };
      if (actionLabel[log.action]) {
        events.push({
          id: `audit-${idx}`,
          type: log.action,
          date: new Date(log.created_at),
          title: actionLabel[log.action],
          content: actionContent[log.action]?.(log) || '',
          by: log.user_id ? staffName(log.user_id) : 'System',
        });
      }
    });
    return events.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [lead, people, visits, allStaff, auditLogs]);

  const NEGATIVE_NOTE_MIN_WORDS = 100;
  const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  const isNegativeStatus = newStatus === 'cancelled' || newStatus === 'not_interested';

  const handleStatusUpdate = async () => {
    if (!newStatus || !lead || !user) return;
    if (isNegativeStatus && !cancelReason) {
      toast({ title: 'Reason required', description: 'Please select a reason', variant: 'destructive' }); return;
    }
    if (cancelReason === 'other' && !cancelOther.trim()) {
      toast({ title: 'Please specify reason', variant: 'destructive' }); return;
    }
    if (isNegativeStatus && wordCount(visitNotes) < NEGATIVE_NOTE_MIN_WORDS) {
      toast({
        title: 'Detailed note required',
        description: `Please write at least ${NEGATIVE_NOTE_MIN_WORDS} words. Currently: ${wordCount(visitNotes)} words.`,
        variant: 'destructive',
      }); return;
    }
    if (newStatus === 'follow_up' && !followUpDate) {
      toast({ title: 'Follow-up date required', variant: 'destructive' }); return;
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
      if (newStatus === 'interested' || newStatus === 'final') {
        if (role === 'sales_person' && !lead.assigned_to_user_id) {
          await supabase.from('leads').update({ assigned_to_user_id: user.id }).eq('id', lead.id);
        }
        if (visitNotes.trim()) {
          await supabase.from('site_visits').insert({ lead_id: lead.id, staff_id: user.id, visit_notes: visitNotes.trim(), status_updated_to: newStatus });
        }
        navigate(`/projects/new?leadId=${lead.id}`); return;
      }
      const { error } = await supabase.from('leads').update(updateData).eq('id', lead.id);
      if (error) throw error;
      if (newStatus === 'visited' || visitNotes.trim()) {
        await supabase.from('site_visits').insert({
          lead_id: lead.id, staff_id: user.id,
          visit_notes: visitNotes.trim() || null,
          status_updated_to: newStatus,
        });
      }
      toast({ title: 'Status updated!', description: `Lead marked as ${statusLabel(newStatus)}` });
      setNewStatus(''); setVisitNotes(''); setFollowUpDate(''); setCancelReason(''); setCancelOther('');
      setIsStatusUpdateOpen(false);
      fetchLead();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setUpdating(false);
    }
  };

  // Only blank the page on the FIRST load. `fetchLead` runs after every
  // mutation, and gating on `loading` alone unmounted the whole subtree each
  // time — closing any open dialog mid-interaction and losing its state.
  if (loading && !lead) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm">Loading lead details...</p>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Lead not found.</p>
      </div>
    );
  }

  const sc = resolveStatus(leadStatusMeta, lead.status);

  return (
    <div className="min-h-screen bg-background font-sans antialiased text-foreground">
      {/* ── Page Header ── */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/50 px-4 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="h-8 px-2">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div className="hidden sm:block w-px h-5 bg-border" />
            {/* The name repeats here only once the hero has scrolled away, so the
                sticky bar still says which lead you are looking at. */}
            <p className="hidden truncate text-sm font-bold leading-tight text-foreground sm:block">
              {lead.customer_name}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Tone classes are theme-aware. These chips used raw bg-amber-50 /
                bg-sky-50, which rendered as near-white pills on the dark canvas. */}
            {lead.follow_up_date && (
              <div className={`hidden items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium md:flex ${toneClasses.warning}`}>
                <Calendar className="h-3 w-3" />
                Follow-up: {new Date(lead.follow_up_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </div>
            )}
            <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${toneClasses[sc.tone]}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
              {sc.label}
            </div>
          </div>
        </div>
      </div>

      {/* ── Hero Strip / Action Bar ── */}
      {/* The gradient wash here fought the Actions button for attention; the spec
          allows one accent per screen and that accent is the primary action. */}
      <div className="border-b border-border/30 bg-background px-4 py-5 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted text-lg font-bold text-foreground sm:h-14 sm:w-14 sm:text-xl">
              {lead.customer_name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight text-foreground sm:text-xl">{lead.customer_name}</h1>
              <div className="mt-1.5 flex flex-col gap-1.5 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
                <a href={`tel:${lead.mobile}`} className="flex w-fit items-center gap-1 font-semibold text-primary hover:underline"><Phone className="h-3 w-3 shrink-0" />{lead.mobile}</a>
                {lead.email && <span className="flex min-w-0 items-center gap-1"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{lead.email}</span></span>}
                {lead.village_city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{lead.village_city}{lead.district ? `, ${lead.district}` : ''}</span>}
                <span className="flex items-center gap-1"><Clock className="h-3 w-3 shrink-0" />Created {new Date(lead.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                {/* Follow-up was desktop-only, hidden exactly from the field staff
                    who need it. It rides in the meta row at every width now. */}
                {lead.follow_up_date && (
                  <span className="flex items-center gap-1 font-semibold text-warning md:hidden">
                    <Calendar className="h-3 w-3 shrink-0" />
                    Follow-up {new Date(lead.follow_up_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions sit full-width on a phone at a 44px tap target, and collapse
              back to the compact desktop pair from sm up. */}
          <div className="flex shrink-0 items-center gap-2">
            {lead.mobile && (
              <Button
                asChild
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground sm:h-9 sm:w-9"
              >
                <a href={`tel:${lead.mobile}`} aria-label={`Call ${lead.customer_name}`}>
                  <Phone className="h-4 w-4" />
                </a>
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-11 flex-1 gap-1.5 px-4 text-sm font-semibold shadow-sm sm:h-9 sm:flex-none">
                  Actions <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 bg-popover border border-border shadow-md rounded-lg p-1 z-50 animate-in fade-in-50 duration-100">
                <DropdownMenuItem onSelect={() => setIsCallLogOpen(true)} className="gap-2 cursor-pointer text-sm hover:bg-accent hover:text-accent-foreground px-2.5 py-2 rounded">
                  <Phone className="h-4 w-4 text-muted-foreground" /> Log a Call
                </DropdownMenuItem>

                {lead.status !== 'cancelled' && lead.status !== 'final' && (
                  <DropdownMenuItem onSelect={() => setIsBookVisitOpen(true)} className="gap-2 cursor-pointer text-sm hover:bg-accent hover:text-accent-foreground px-2.5 py-2 rounded">
                    <Calendar className="h-4 w-4 text-muted-foreground" /> Book Visit
                  </DropdownMenuItem>
                )}

                {/* "Fill Plant Details" and "Create Quotation" used to live here.
                    Quotation creation now sits directly in the Quotations area
                    below, where the user is already looking, and collects the
                    system details itself — so plant details are no longer a
                    separate prerequisite step. */}

                {canUpdateStatus && lead.status !== 'cancelled' && lead.status !== 'final' && (
                  <>
                    <DropdownMenuSeparator className="-mx-1 my-1 h-px bg-muted" />
                    <DropdownMenuItem onSelect={() => setIsStatusUpdateOpen(true)} className="gap-2 cursor-pointer text-sm hover:bg-accent hover:text-accent-foreground px-2.5 py-2 rounded text-warning font-semibold focus:text-warning">
                      <AlertTriangle className="h-4 w-4" /> Change Status
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* ── Tabbed Layout ── */}
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-4">
        {/* A booked visit is the lead's next action, so it sits above the tabs
            and stays visible whichever tab is open. Renders nothing when no
            visit is scheduled — history is in the activity timeline. */}
        <LeadVisitsPanel
          variant="banner"
          leadId={lead.id}
          userId={user?.id ?? ''}
          staffNames={staffNameMap}
          onVisitCompleted={fetchLead}
        />

        <Tabs defaultValue="details" className="space-y-4">
          {/* Three fixed tabs, so they split the width evenly on phones rather
              than running off the right edge — the strip measured 389px in a
              375px viewport, and nothing scrolls, so "Plant Details" was
              clipped and unreachable. Labels shorten below sm to fit. */}
          <TabsList className="grid h-auto w-full grid-cols-3 sm:inline-flex sm:h-10 sm:w-auto">
            <TabsTrigger value="details" className="gap-1.5 px-2 text-xs sm:px-3 sm:text-sm">
              <User className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">Details</span>
              <span className="hidden sm:inline">Lead Details</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-1.5 px-2 text-xs sm:px-3 sm:text-sm">
              <FileText className="h-4 w-4 shrink-0" />
              <span>Documents</span>
            </TabsTrigger>
            <TabsTrigger value="plant" className="gap-1.5 px-2 text-xs sm:px-3 sm:text-sm">
              <TrendingUp className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">Plant</span>
              <span className="hidden sm:inline">Plant Details</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-0">
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-start">

          {/* ══════════════ LEFT COLUMN ══════════════ */}
          <div className="space-y-4">

            {/* 1. Contact Details */}
            <Section
              title="Customer Contact Details"
              icon={<User className="h-4 w-4" />}
              action={
                <Button variant="outline" size="sm" onClick={handleOpenEditContact} className="h-8 gap-1 text-xs font-semibold">
                  <Edit className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
              }
            >
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <InfoRow label="Mobile" value={lead.mobile} href={`tel:${lead.mobile}`} />
                  <InfoRow label="Alternate Mobile" value={lead.alt_mobile} href={lead.alt_mobile ? `tel:${lead.alt_mobile}` : undefined} />
                  <InfoRow label="Email" value={lead.email} />
                </div>
                <Separator />
                <InfoRow label="Contact Address" value={lead.address} />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <InfoRow label="Village / City" value={lead.village_city} />
                  <InfoRow label="District" value={lead.district} />
                  <InfoRow label="State" value={lead.state} />
                </div>
                {lead.latitude && lead.longitude && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${lead.latitude},${lead.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-fit items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                  >
                    <MapPin className="h-3.5 w-3.5 animate-bounce" />
                    <span className="font-mono text-[11px] text-muted-foreground mr-1">{lead.latitude?.toFixed(4)}, {lead.longitude?.toFixed(4)}</span>
                    Open in Maps
                  </a>
                )}
              </div>
            </Section>

            {/* 2. Discom Connection Specs */}
            <Section
              title="Discom Connection Specs"
              icon={<Zap className="h-4 w-4" />}
              action={lead.k_number ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={syncingKno}
                  onClick={handleSyncKno}
                  className="h-8 shrink-0 gap-1.5 px-3 text-xs font-semibold"
                >
                  <RefreshCw className={`h-3 w-3 ${syncingKno ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Sync Specs</span>
                </Button>
              ) : undefined}
            >
              <div className="p-5 space-y-4">
                {lead.k_number ? (
                  <InfoRow label="K-Number (Rajasthan Discom)" value={lead.k_number} mono />
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      K-Number (Rajasthan Discom)
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={knoInput}
                        onChange={(e) => setKnoInput(e.target.value.replace(/\D/g, '').slice(0, 12))}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddKno(); }}
                        placeholder="Enter 12-digit K-Number"
                        inputMode="numeric"
                        maxLength={12}
                        className="h-9 text-sm font-mono tracking-wider sm:max-w-xs"
                      />
                      <Button
                        size="sm"
                        onClick={handleAddKno}
                        disabled={syncingKno || knoInput.length !== 12}
                        className="h-9 shrink-0 gap-1.5 text-xs font-semibold"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${syncingKno ? 'animate-spin' : ''}`} />
                        {syncingKno ? 'Syncing…' : 'Save & Sync'}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground/60">
                      Add the K-Number from the customer's electricity bill to fetch Discom connection details.
                    </p>
                  </div>
                )}

                {lead.kno_details ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <InfoRow label="Connection Name" value={lead.kno_details.name} />
                      <InfoRow label="Meter Number" value={lead.kno_details.meterno} mono />
                    </div>
                    <InfoRow label="Discom Address" value={lead.kno_details.address} />
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      <InfoRow label="Load Capacity" value={lead.kno_details.sancload || lead.kno_details.connload ? `${lead.kno_details.sancload || lead.kno_details.connload} kW` : null} />
                      <InfoRow label="Office Name" value={lead.kno_details.officename} />
                      <InfoRow label="Category / Tariff" value={lead.kno_details.category || lead.kno_details.tariffcode} />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-muted/20 py-8 text-center space-y-1.5">
                    <Zap className="h-6 w-6 text-muted-foreground/40 mx-auto" />
                    <p className="text-xs text-muted-foreground font-medium">No connection specs fetched yet</p>
                    <p className="text-[11px] text-muted-foreground/60 max-w-[220px] mx-auto">
                      {lead.k_number
                        ? 'Click "Sync Specs" to download consumer data from Discom.'
                        : 'Add the K-Number above to download consumer data from Discom.'}
                    </p>
                  </div>
                )}

                <Separator />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <InfoRow label="Interested Capacity" value={lead.kw_interest ? `${lead.kw_interest} kW` : null} />
                  <InfoRow label="Lead Source" value={statusLabel(lead.source)} />
                  <InfoRow label="Created" value={new Date(lead.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} />
                  <InfoRow label="Created By" value={staffName(lead.created_by_user_id)} />
                </div>
              </div>
            </Section>

          </div>

          {/* ══════════════ RIGHT COLUMN — Activity Timeline ══════════════ */}
          <div className="xl:sticky xl:top-[73px]">
            <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 90px)' }}>
              {/* Header */}
              <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Activity className="h-4 w-4 text-primary" />
                  Activity Timeline
                </div>
                <Badge variant="secondary" className="text-[10px] font-semibold px-2 py-0.5">
                  {timelineEvents.length} events
                </Badge>
              </div>

              {/* Scrollable timeline */}
              <div className="overflow-y-auto flex-1 p-4">
                {timelineEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                    <Clock className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">No activity yet.</p>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-3.5 top-3 bottom-3 w-px bg-border/60" />

                    <div className="space-y-0">
                      {timelineEvents.map((evt) => (
                        <div key={evt.id} className="relative flex gap-3 pb-5 last:pb-0">
                          {/* Icon dot */}
                          <div className="relative z-10 shrink-0 h-7 w-7 rounded-full bg-background border border-border flex items-center justify-center mt-0.5">
                            {EVENT_ICON[evt.type] || <Clock className="h-3 w-3 text-muted-foreground" />}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 bg-muted/20 rounded-xl border border-border/40 p-3 hover:bg-muted/30 transition-colors">
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <p className="text-xs font-semibold text-foreground leading-tight">{evt.title}</p>
                              <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                                {evt.date.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            {evt.content && (
                              <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed line-clamp-4 whitespace-pre-wrap">{evt.content}</p>
                            )}
                            <p className="text-[10px] text-muted-foreground/70 mt-1.5 font-medium">
                              by <span className="text-foreground/70">{evt.by}</span>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          </div>
          </TabsContent>

          {/* ══════════════ DOCUMENTS TAB ══════════════ */}
          <TabsContent value="documents" className="mt-0">
            <LeadDocumentsPanel leadId={lead.id} userId={user?.id ?? ''} />
          </TabsContent>

          {/* ══════════════ PLANT DETAILS TAB ══════════════ */}
          <TabsContent value="plant" className="mt-0 space-y-4">
            <Section title="Plant & Quotation Details" icon={<TrendingUp className="h-4 w-4" />}>
              <div className="p-5 space-y-4">
                {lead.plant_details && Object.keys(lead.plant_details).length > 0 ? (
                  <div className="space-y-4">
                    {(role === 'sales_person' || role === 'admin') && (
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsPlantDetailsOpen(true)}
                          className="h-8 gap-1 text-xs font-semibold"
                        >
                          <Edit className="h-3.5 w-3.5" /> Edit Plant Details
                        </Button>
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <InfoRow label="Phase" value={(lead.plant_details as any).phase} />
                      <InfoRow label="Panel Make" value={(lead.plant_details as any).panel_make} />
                      <InfoRow label="Panel Wattage" value={(lead.plant_details as any).panel_wt} />
                      <InfoRow label="Inverter Make" value={(lead.plant_details as any).inverter} />
                      <InfoRow label="Inverter Capacity" value={(lead.plant_details as any).inverter_wt} />
                      <InfoRow label="Wire Make" value={(lead.plant_details as any).wiremake} />
                      <InfoRow label="Wire Size" value={(lead.plant_details as any).wire_size} />
                      <InfoRow label="Wire Material" value={(lead.plant_details as any).wire_material} />
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-muted/30 p-3 rounded-xl border">
                      <InfoRow label="Total Cost" value={(lead.plant_details as any).total_cost ? `₹${Number((lead.plant_details as any).total_cost).toLocaleString('en-IN')}` : '—'} />
                      <InfoRow label="Subsidy Applied" value={(lead.plant_details as any).subsidy ? `Yes (${formatSubsidy(Number((lead.plant_details as any).subsidy_amount) || plantSubsidyAmount)})` : 'No'} />
                      <InfoRow label="Net Customer Cost" value={(lead.plant_details as any).net_cost ? `₹${Number((lead.plant_details as any).net_cost).toLocaleString('en-IN')}` : '—'} />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-muted/20 py-8 text-center space-y-2.5">
                    <TrendingUp className="h-6 w-6 text-muted-foreground/40 mx-auto" />
                    <p className="text-xs text-muted-foreground font-medium">No plant details filled yet</p>
                    <p className="text-[11px] text-muted-foreground/60 max-w-[240px] mx-auto">
                      Panel, inverter and wiring specs are usually captured during the site visit.
                    </p>
                    {(role === 'sales_person' || role === 'admin') && (
                      <Button
                        size="sm"
                        onClick={() => setIsPlantDetailsOpen(true)}
                        className="h-8 gap-1.5 text-xs font-semibold"
                      >
                        <TrendingUp className="h-3.5 w-3.5" /> Add Plant Details
                      </Button>
                    )}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-primary" /> Generated Quotations
                    </h4>
                    {(role === 'sales_person' || role === 'admin') && (
                      <Button
                        size="sm"
                        onClick={handleCreateQuotationFromPlant}
                        className="h-8 gap-1.5 text-xs font-semibold"
                      >
                        <FileText className="h-3.5 w-3.5" /> Create Quotation
                      </Button>
                    )}
                  </div>

                  {Array.isArray(lead.quotation_details) && lead.quotation_details.length > 0 ? (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-muted/40 font-mono text-[10px] uppercase border-b text-foreground">
                          <tr>
                            <th className="p-2.5 font-semibold">Name / Code</th>
                            <th className="p-2.5 font-semibold">Specs</th>
                            <th className="p-2.5 font-semibold text-right">Price</th>
                            <th className="p-2.5 font-semibold text-center">Status</th>
                            <th className="p-2.5 font-semibold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {lead.quotation_details.map((q: any, idx: number) => (
                            <tr key={q.quotation_number || idx} className="hover:bg-muted/10">
                              <td className="p-2.5">
                                <div className="font-semibold text-foreground">{q.name || `Quote ${idx + 1}`}</div>
                                <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{q.quotation_number}</div>
                              </td>
                              <td className="p-2.5">
                                <div className="text-foreground">{q.capacity_kw ? `${q.capacity_kw} kW` : '—'} ({q.phase || '—'})</div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">{q.panel_brand || '—'} / {q.inverter_brand || '—'}</div>
                              </td>
                              <td className="p-2.5 text-right font-bold text-foreground">
                                ₹{Number(q.quote_price || 0).toLocaleString('en-IN')}
                              </td>
                              <td className="p-2.5 text-center">
                                <Badge
                                  className={`text-[9px] uppercase font-bold ${
                                    q.status === 'accepted'
                                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                                      : q.status === 'rejected'
                                      ? 'bg-red-100 text-red-800 hover:bg-red-100'
                                      : q.status === 'sent'
                                      ? 'bg-blue-100 text-blue-800 hover:bg-blue-100'
                                      : 'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {q.status || 'pending'}
                                </Badge>
                              </td>
                              <td className="p-2.5 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedPreviewQuote(q);
                                      setIsQuotationPreviewOpen(true);
                                    }}
                                    className="h-7 text-[10px] px-2"
                                  >
                                    View
                                  </Button>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                                        <ChevronDown className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="bg-popover border border-border shadow p-1 rounded z-50">
                                      <DropdownMenuItem
                                        onClick={() => handleOpenCreateQuote(idx)}
                                        className="gap-2 cursor-pointer text-xs hover:bg-accent px-2 py-1.5 rounded"
                                      >
                                        Edit / Regenerate
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => handleSendQuotationWhatsApp(q)}
                                        className="gap-2 cursor-pointer text-xs hover:bg-accent px-2 py-1.5 rounded text-emerald-600 font-semibold"
                                      >
                                        Send on WhatsApp
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => handleDeleteQuotation(idx)}
                                        className="gap-2 cursor-pointer text-xs hover:bg-accent px-2 py-1.5 rounded text-destructive font-semibold"
                                      >
                                        Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No quotations created yet.</p>
                  )}

                  {/* Overall Status Banner for Customer Reply */}
                  {lead.status === 'quotation_sent' && (
                    <div className="mt-2 flex items-start gap-2.5 p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <Clock className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-yellow-800">Waiting for Customer Approval</p>
                        <p className="text-[11px] text-yellow-700/80 mt-0.5">Quotation sent via WhatsApp. Customer can reply CONFIRM or REJECT.</p>
                      </div>
                    </div>
                  )}

                  {lead.status === 'quotation_accepted' && (
                    <div className="mt-2 flex items-start gap-2.5 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-emerald-800">Quotation Accepted ✅</p>
                        {(lead as any).quotation_response_at && (
                          <p className="text-[11px] text-emerald-700/80 mt-0.5">
                            Accepted on {new Date((lead as any).quotation_response_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                        {(lead as any).quotation_response_message && (
                          <p className="text-[11px] text-emerald-700/80 italic">Customer replied: "{(lead as any).quotation_response_message}"</p>
                        )}
                      </div>
                    </div>
                  )}

                  {lead.status === 'quotation_rejected' && (
                    <div className="mt-2 flex items-start gap-2.5 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                      <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-red-800">Quotation Rejected ❌</p>
                        {(lead as any).quotation_response_at && (
                          <p className="text-[11px] text-red-700/80 mt-0.5">
                            Rejected on {new Date((lead as any).quotation_response_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                        {(lead as any).quotation_response_message && (
                          <p className="text-[11px] text-red-700/80 italic">Customer replied: "{(lead as any).quotation_response_message}"</p>
                        )}
                      </div>
                    </div>
                  )}

                  {Array.isArray(lead.quotation_details) && lead.quotation_details.some((q: any) => q.status === 'accepted') && !project && (
                    <Button
                      onClick={() => navigate(`/projects/new?leadId=${lead.id}`)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 shadow-sm mt-3"
                    >
                      <TrendingUp className="mr-1.5 h-3.5 w-3.5" /> Convert to Deal (Approved Quotation)
                    </Button>
                  )}
                </div>
              </div>
            </Section>

          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Control Dialogs (Popups) ─── */}

      {/* 1. Log Call Dialog */}
      <Dialog open={isCallLogOpen} onOpenChange={setIsCallLogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-background border border-border shadow-lg p-6 rounded-lg animate-in fade-in-50 duration-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
              <Phone className="h-4.5 w-4.5 text-primary" /> Log Call / Activity
            </DialogTitle>
            <DialogDescription className="sr-only">
              Log phone calls and notes about communication with the client.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Update Lead Status (Optional)</Label>
              <Select value={callStatus} onValueChange={v => setCallStatus(v as LeadStatus)}>
                <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Keep current status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New Lead</SelectItem>
                  <SelectItem value="visited">Site Visited</SelectItem>
                  <SelectItem value="follow_up">Need Follow-up</SelectItem>
                  <SelectItem value="interested">Interested (Convert to Deal)</SelectItem>
                  <SelectItem value="not_interested">Not Interested</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {callStatus === 'follow_up' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Follow-up Date *</Label>
                <Input type="date" value={callFollowUpDate} onChange={e => setCallFollowUpDate(e.target.value)} className="h-10 text-sm" />
                <p className="text-[11px] text-muted-foreground">A task will be created for the lead's assignee, due on this date.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Call Comments / Note *</Label>
              <Textarea
                placeholder="Type customer feedback or call log notes here..."
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                rows={4}
                className="text-sm rounded-xl resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => { setIsCallLogOpen(false); setCallNotes(''); setCallStatus(''); setCallFollowUpDate(''); }}>
              Cancel
            </Button>
            <Button onClick={handleLogCall} disabled={loggingCall || !callNotes.trim()} size="sm" className="gradient-primary text-primary-foreground font-semibold">
              {loggingCall ? 'Logging...' : 'Save Call Log'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* "Log Visit" was removed: completing a visit (CompleteVisitDialog /
          complete_site_visit RPC) records outcome, GPS and notes on the same
          site_visits row, which already feeds the activity timeline — a
          separate manual log only produced duplicate entries. */}

      {/* 4. Book Visit Dialog */}
      <Dialog open={isBookVisitOpen} onOpenChange={setIsBookVisitOpen}>
        <DialogContent className="sm:max-w-[450px] bg-background border border-border shadow-lg p-6 rounded-lg animate-in fade-in-50 duration-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
              <Calendar className="h-4.5 w-4.5 text-primary" /> Book Site Visit / Appointment
            </DialogTitle>
            <DialogDescription className="sr-only">
              Schedule a site visit date and assign a representative.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Visit Date & Time *</Label>
              <Input type="datetime-local" value={apptDate} onChange={e => setApptDate(e.target.value)} className="h-10 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Assign Sales Person (Optional)</Label>
              <Select value={apptSalesId || '__none__'} onValueChange={v => setApptSalesId(v === '__none__' ? '' : v)}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Leave unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Leave unassigned (Open for Claim)</SelectItem>
                  {salesPersons.map(sp => (
                    <SelectItem key={sp.user_id} value={sp.user_id}>{sp.full_name} — {sp.mobile}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Visit Instructions / Notes</Label>
              <Input
                placeholder="Directions or specific client requests..."
                value={apptNotes}
                onChange={(e) => setApptNotes(e.target.value)}
                className="h-10 text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => { setIsBookVisitOpen(false); setApptDate(''); setApptSalesId(''); setApptNotes(''); }}>
              Cancel
            </Button>
            <Button onClick={handleBookAppointment} disabled={bookingAppt || !apptDate} size="sm" className="gradient-primary text-primary-foreground font-semibold">
              {bookingAppt ? 'Booking...' : 'Book Appointment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5. Update Status Dialog */}
      <Dialog open={isStatusUpdateOpen} onOpenChange={setIsStatusUpdateOpen}>
        <DialogContent className="sm:max-w-[450px] max-h-[85vh] overflow-y-auto bg-background border border-border shadow-lg p-6 rounded-lg animate-in fade-in-50 duration-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
              <AlertTriangle className="h-4.5 w-4.5 text-amber-500" /> Advanced Status Change
            </DialogTitle>
            <DialogDescription className="sr-only">
              Update the current workflow status of this lead.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">New Status</Label>
              <Select value={newStatus} onValueChange={v => setNewStatus(v as LeadStatus)}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Select status" /></SelectTrigger>
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

            {isNegativeStatus && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Reason *</Label>
                <Select value={cancelReason} onValueChange={v => setCancelReason(v as CancellationReason)}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent>
                    {cancellationReasons.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {cancelReason === 'other' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-foreground">Specify Reason *</Label>
                <Textarea value={cancelOther} onChange={e => setCancelOther(e.target.value)} placeholder="Describe the reason" rows={2} className="resize-none" />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                Detailed Notes
                {isNegativeStatus && <span className="text-destructive ml-1">* (min {NEGATIVE_NOTE_MIN_WORDS} words)</span>}
              </Label>
              <Textarea
                value={visitNotes}
                onChange={e => setVisitNotes(e.target.value)}
                placeholder={isNegativeStatus
                  ? `Explain in detail why this lead is being marked ${statusLabel(newStatus)}. At least ${NEGATIVE_NOTE_MIN_WORDS} words required.`
                  : 'Notes about this update'}
                rows={isNegativeStatus ? 4 : 2}
                className="resize-none text-sm"
              />
              {isNegativeStatus && (
                <p className={`text-xs ${wordCount(visitNotes) >= NEGATIVE_NOTE_MIN_WORDS ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  {wordCount(visitNotes)} / {NEGATIVE_NOTE_MIN_WORDS} words
                </p>
              )}
            </div>

            {newStatus === 'follow_up' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Follow-up Date *</Label>
                <Input type="datetime-local" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} className="h-10 text-sm" />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => { setIsStatusUpdateOpen(false); setNewStatus(''); setVisitNotes(''); setFollowUpDate(''); setCancelReason(''); setCancelOther(''); }}>
              Cancel
            </Button>
            <Button onClick={handleStatusUpdate} className="gradient-primary text-primary-foreground font-semibold" size="sm" disabled={updating || !newStatus}>
              {updating ? 'Updating...' : 'Confirm Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 6. Plant Details Dialog */}
      <Dialog open={isPlantDetailsOpen} onOpenChange={setIsPlantDetailsOpen}>
        <DialogContent className="sm:max-w-[700px] bg-background border border-border shadow-lg p-6 rounded-lg max-h-[90vh] overflow-y-auto animate-in fade-in-50 duration-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
              <TrendingUp className="h-5 w-5 text-primary" />
              Update Plant Technical Specifications
            </DialogTitle>
            <DialogDescription className="sr-only">
              Configure parameters like phase, panel brand, inverter, and wires.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-3">
            {/* Phase Dropdown */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Phase</Label>
              <Select value={plantPhase} onValueChange={setPlantPhase}>
                <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Select Phase" /></SelectTrigger>
                <SelectContent>
                  {(dropdownOptions.phase || []).map((opt: string) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Panel Make Dropdown */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Panel Make</Label>
              <Select value={plantPanelMake} onValueChange={setPlantPanelMake}>
                <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Select Panel Make" /></SelectTrigger>
                <SelectContent>
                  {(dropdownOptions.panel_make || []).map((opt: string) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Panel Wattage Dropdown */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Panel Wattage</Label>
              <Select value={plantPanelWt} onValueChange={setPlantPanelWt}>
                <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Select Wattage" /></SelectTrigger>
                <SelectContent>
                  {(dropdownOptions.panel_wt || []).map((opt: string) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Inverter Make Dropdown */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Inverter Make</Label>
              <Select value={plantInverter} onValueChange={setPlantInverter}>
                <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Select Inverter Make" /></SelectTrigger>
                <SelectContent>
                  {(dropdownOptions.inverter || []).map((opt: string) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Inverter Capacity Dropdown */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Inverter Capacity</Label>
              <Select value={plantInverterWt} onValueChange={setPlantInverterWt}>
                <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Select Capacity" /></SelectTrigger>
                <SelectContent>
                  {(dropdownOptions.inverter_wt || []).map((opt: string) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Wire Make Dropdown */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Wire Make</Label>
              <Select value={plantWiremake} onValueChange={setPlantWiremake}>
                <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Select Wire Make" /></SelectTrigger>
                <SelectContent>
                  {(dropdownOptions.wiremake || []).map((opt: string) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Wire Size Dropdown */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Wire Size</Label>
              <Select value={plantWireSize} onValueChange={setPlantWireSize}>
                <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Select Wire Size" /></SelectTrigger>
                <SelectContent>
                  {(dropdownOptions.wire_size || []).map((opt: string) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Wire Material Dropdown */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Wire Material</Label>
              <Select value={plantWireMaterial} onValueChange={setPlantWireMaterial}>
                <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Select Wire Material" /></SelectTrigger>
                <SelectContent>
                  {(dropdownOptions.wire_material || []).map((opt: string) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Total Cost Input */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Total Cost (INR)</Label>
              <Input
                type="number"
                value={plantTotalCost}
                onChange={e => setPlantTotalCost(e.target.value)}
                placeholder="e.g. 150000"
                className="h-10 text-sm"
              />
            </div>

            {/* Subsidy Checkbox */}
            <div className="flex items-center space-x-2 pt-8">
              <input
                type="checkbox"
                id="plantSubsidy"
                checked={plantSubsidy}
                onChange={e => setPlantSubsidy(e.target.checked)}
                className="h-4.5 w-4.5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
              />
              <Label htmlFor="plantSubsidy" className="text-sm font-semibold text-foreground cursor-pointer select-none">
                Apply Central Subsidy ({formatSubsidy(plantSubsidyAmount)} deduction)
              </Label>
            </div>
          </div>

          {/* Pricing Preview */}
          {plantTotalCost && (
            <div className="mt-4 p-4 bg-muted/40 rounded-xl border space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Base Total Cost:</span>
                <span className="font-semibold text-foreground">₹{Number(plantTotalCost).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subsidy Benefit:</span>
                <span className="font-semibold text-emerald-600">
                  {plantSubsidy ? `- ${formatSubsidy(plantSubsidyAmount)}` : '₹0 (Not applied)'}
                </span>
              </div>
              <Separator className="my-1.5" />
              <div className="flex justify-between text-sm font-bold">
                <span className="text-foreground">Net Customer Price:</span>
                <span className="text-primary text-base">
                  ₹{Math.max(0, (Number(plantTotalCost) || 0) - (plantSubsidy ? plantSubsidyAmount : 0)).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" size="sm" onClick={() => setIsPlantDetailsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePlantDetails} size="sm" className="gradient-primary text-primary-foreground font-semibold">
              Save Plant Details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 7. Create/Edit Quotation Dialog */}
      <Dialog open={isCreateQuoteOpen} onOpenChange={setIsCreateQuoteOpen}>
        <DialogContent className="sm:max-w-[550px] bg-background border border-border shadow-lg p-6 rounded-lg max-h-[85vh] overflow-y-auto animate-in fade-in-50 duration-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
              {editingQuoteIndex !== null ? 'Edit Quotation Details' : 'Create Quotation'}
            </DialogTitle>
            <DialogDescription>
              Provide specific panel brands, capacity, and cost details for this quotation version.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 text-xs">
            <div className="space-y-1.5">
              <Label className="font-semibold text-foreground">Quotation Name *</Label>
              <Input
                value={quoteName}
                onChange={e => setQuoteName(e.target.value)}
                placeholder="e.g. customer_name - 01 - 3kW"
                className="h-9 text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-semibold text-foreground">Capacity (kW) *</Label>
                <Input
                  type="number"
                  value={quoteCapacity}
                  onChange={e => setQuoteCapacity(e.target.value)}
                  placeholder="e.g. 3"
                  className="h-9 text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="font-semibold text-foreground">Grid Phase</Label>
                <Select value={quotePhase} onValueChange={setQuotePhase}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select Phase" />
                  </SelectTrigger>
                  <SelectContent>
                    {(dropdownOptions.phase || []).map((opt: string) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="font-semibold text-foreground">Panel Brand</Label>
                <Select value={quotePanelBrand} onValueChange={setQuotePanelBrand}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select Panel Brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {(dropdownOptions.panel_make || []).map((opt: string) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="font-semibold text-foreground">Panel Wattage (W)</Label>
                <Select value={quotePanelWatt} onValueChange={setQuotePanelWatt}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select Panel Wattage" />
                  </SelectTrigger>
                  <SelectContent>
                    {(dropdownOptions.panel_wt || []).map((opt: string) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="font-semibold text-foreground">Panel Qty</Label>
                <Input
                  type="number"
                  value={quotePanelQty}
                  onChange={e => setQuotePanelQty(e.target.value)}
                  placeholder="e.g. 6"
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="font-semibold text-foreground">Inverter Brand</Label>
                <Select value={quoteInverterBrand} onValueChange={setQuoteInverterBrand}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select Inverter" />
                  </SelectTrigger>
                  <SelectContent>
                    {(dropdownOptions.inverter || []).map((opt: string) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="font-semibold text-foreground">Inverter Capacity (kW)</Label>
                <Select value={quoteInverterCapacity} onValueChange={setQuoteInverterCapacity}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select Inverter Capacity" />
                  </SelectTrigger>
                  <SelectContent>
                    {(dropdownOptions.inverter_wt || []).map((opt: string) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="font-semibold text-foreground">Structure Specs / Gauge</Label>
                <Input
                  value={quoteStructureType}
                  onChange={e => setQuoteStructureType(e.target.value)}
                  placeholder="e.g. HDG 80mm"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <Separator className="my-2" />

            <div className="grid grid-cols-2 gap-3 bg-muted/40 p-3 rounded-lg border">
              <div className="space-y-1.5">
                <Label className="font-semibold text-foreground">Turnkey Cost (₹) *</Label>
                <Input
                  type="number"
                  value={quoteTotalCost}
                  onChange={e => setQuoteTotalCost(e.target.value)}
                  placeholder="e.g. 180000"
                  className="h-9 text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="font-semibold text-foreground">Subsidy Applied</Label>
                <div className="flex items-center gap-2 h-9">
                  <Button
                    type="button"
                    variant={quoteSubsidy ? "default" : "outline"}
                    className="h-7 text-[10px] w-14"
                    onClick={() => setQuoteSubsidy(true)}
                  >
                    YES
                  </Button>
                  <Button
                    type="button"
                    variant={!quoteSubsidy ? "default" : "outline"}
                    className="h-7 text-[10px] w-14"
                    onClick={() => {
                      setQuoteSubsidy(false);
                      setQuoteSubsidyAmount('');
                    }}
                  >
                    NO
                  </Button>
                </div>
              </div>

              {quoteSubsidy && (
                <div className="space-y-1.5 col-span-2">
                  <Label className="font-semibold text-foreground">Subsidy Amount (₹)</Label>
                  <Input
                    type="number"
                    value={quoteSubsidyAmount}
                    onChange={e => setQuoteSubsidyAmount(e.target.value)}
                    placeholder={`Default: ${quoteDefaultSubsidy}`}
                    className="h-9 text-xs"
                  />
                </div>
              )}

              <div className="space-y-1.5 col-span-2">
                <Label className="font-semibold text-foreground">Offered Deal Quote Price (₹) *</Label>
                <Input
                  type="number"
                  value={quotePrice}
                  onChange={e => setQuotePrice(e.target.value)}
                  placeholder="Final offered price"
                  className="h-9 text-xs font-bold text-orange-600 bg-orange-50 border-orange-200"
                  required
                />
                <p className="text-[10px] text-muted-foreground">Calculated Turnkey - Subsidy. You can override it.</p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 border-t pt-3">
            <Button variant="outline" size="sm" onClick={() => setIsCreateQuoteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateQuotation}
              disabled={!quotePrice || isNaN(Number(quotePrice)) || !quoteName.trim()}
              size="sm"
              className="gradient-primary text-primary-foreground font-semibold"
            >
              {editingQuoteIndex !== null ? 'Save Changes' : 'Generate Quote'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 8. Quotation PDF/Print Preview Dialog */}
      <Dialog open={isQuotationPreviewOpen} onOpenChange={setIsQuotationPreviewOpen}>
        <DialogContent className="max-w-4xl w-[95vw] h-[90vh] p-0 flex flex-col bg-background border border-border shadow-2xl rounded-xl overflow-hidden animate-in fade-in-50 duration-150">
          <DialogHeader className="px-5 py-3.5 border-b border-border/60 flex items-center justify-between shrink-0 flex-row">
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
              <FileText className="h-4.5 w-4.5 text-primary" />
              Quotation Document — {selectedPreviewQuote?.quotation_number}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Quotation preview panel with print and WhatsApp features.
            </DialogDescription>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleDownloadPDF} className="text-xs h-8 gradient-primary text-primary-foreground font-semibold">
                Download PDF
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => handleSendQuotationWhatsApp(selectedPreviewQuote)}
                disabled={sendingWhatsApp}
                className="text-xs h-8 gap-1 border-emerald-200 text-emerald-800 bg-white hover:bg-emerald-50 font-semibold"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {sendingWhatsApp ? 'Sending...' : 'Send WhatsApp'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIsQuotationPreviewOpen(false)} className="text-xs h-8">
                Close
              </Button>
            </div>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto p-6 bg-slate-100/50 font-sans">
            {/* Printable Document A4 Container */}
            <div className="max-w-2xl mx-auto bg-white border border-slate-200 shadow-xl rounded-xl p-8 min-h-[297mm] flex flex-col justify-between text-slate-800" id="screen-quotation-area">
              <div className="space-y-6">
                {/* Header (Letterhead) */}
                <div className="flex justify-between items-start border-b-2 border-orange-500 pb-5">
                  <div>
                    <h2 className="text-2xl font-extrabold text-orange-600 tracking-wide">
                      {vendorProfile?.firm_name || "MAYUKH SOLAR"}
                    </h2>
                    <p className="text-[11px] text-slate-500 font-medium">Solar Energy Solutions</p>
                    {vendorProfile?.address && <p className="text-[11px] text-slate-500 mt-1 max-w-sm leading-relaxed">{vendorProfile.address}</p>}
                    {vendorProfile?.mobile && (
                      <p className="text-[11px] text-slate-500 mt-1 font-semibold">
                        Mob: {vendorProfile.mobile} {vendorProfile.email ? ` | ${vendorProfile.email}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900 uppercase tracking-widest">QUOTATION</p>
                    <p className="text-[11px] text-slate-600 mt-1 font-semibold">No: {selectedPreviewQuote?.quotation_number}</p>
                    <p className="text-[11px] text-slate-500">
                      Date: {selectedPreviewQuote?.created_at ? new Date(selectedPreviewQuote.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                    </p>
                  </div>
                </div>

                {/* Grid for Customer vs System Specs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="border border-slate-200/80 rounded-xl p-4 bg-slate-50/50">
                    <h4 className="text-[10px] font-bold text-orange-600 uppercase tracking-wider mb-2">Quotation For</h4>
                    <p className="text-sm font-bold text-slate-900">{lead.customer_name}</p>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                      {[lead.address, lead.village_city, lead.district, lead.state].filter(Boolean).join(", ")}
                    </p>
                    {lead.mobile && <p className="text-xs text-slate-900 mt-2 font-semibold">Mob: {lead.mobile}</p>}
                  </div>

                  <div className="border border-slate-200/80 rounded-xl p-4 bg-slate-50/50">
                    <h4 className="text-[10px] font-bold text-orange-600 uppercase tracking-wider mb-2">System Specs</h4>
                    <p className="text-sm font-bold text-slate-900">
                      {selectedPreviewQuote?.capacity_kw || 'N/A'} kW System ({selectedPreviewQuote?.phase || 'N/A'})
                    </p>
                    <div className="text-xs text-slate-600 mt-2 space-y-1">
                      <p><strong>Panel:</strong> {selectedPreviewQuote?.panel_brand || 'N/A'} ({selectedPreviewQuote?.panel_watt ? `${selectedPreviewQuote.panel_watt}W` : 'N/A'}) x {selectedPreviewQuote?.panel_qty || 'N/A'}</p>
                      <p><strong>Inverter:</strong> {selectedPreviewQuote?.inverter_brand || 'N/A'} ({selectedPreviewQuote?.inverter_capacity ? `${selectedPreviewQuote.inverter_capacity} kW` : 'N/A'})</p>
                      <p><strong>Cable:</strong> {lead.plant_details?.wiremake || 'Polycab'} ({lead.plant_details?.wire_size || '4 sqmm'} {lead.plant_details?.wire_material || 'Copper'})</p>
                      {selectedPreviewQuote?.structure_type && (
                        <p><strong>Structure:</strong> {selectedPreviewQuote.structure_type}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Pricing Table */}
                <div className="space-y-2 pt-2">
                  <h4 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider border-b pb-1">Cost &amp; Subsidy Breakdown</h4>
                  <table className="w-full text-xs text-left border-collapse border border-slate-200">
                    <thead>
                      <tr className="bg-orange-50/80 text-orange-950 font-bold">
                        <th className="p-2.5 border border-slate-200">Description</th>
                        <th className="p-2.5 border border-slate-200 text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="p-2.5 border border-slate-200">Solar Power Plant Setup (Turnkey Cost)</td>
                        <td className="p-2.5 border border-slate-200 text-right font-medium">
                          {selectedPreviewQuote?.total_cost ? Number(selectedPreviewQuote.total_cost).toLocaleString('en-IN') : '0'}
                        </td>
                      </tr>
                      {!!selectedPreviewQuote?.subsidy_amount && (
                        <tr>
                          <td className="p-2.5 border border-slate-200 text-emerald-700 font-semibold">Central Government Subsidy Benefit</td>
                          <td className="p-2.5 border border-slate-200 text-right text-emerald-700 font-semibold">- {Number(selectedPreviewQuote.subsidy_amount).toLocaleString('en-IN')}</td>
                        </tr>
                      )}
                      <tr className="bg-slate-50 font-bold text-slate-900">
                        <td className="p-2.5 border border-slate-200">Net Cost to Customer</td>
                        <td className="p-2.5 border border-slate-200 text-right text-slate-950">
                          ₹{selectedPreviewQuote?.net_cost ? Number(selectedPreviewQuote.net_cost).toLocaleString('en-IN') : '0'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Quotation Price offered */}
                <div className="p-4 bg-orange-50 border border-orange-200/80 rounded-xl flex justify-between items-center mt-4">
                  <div>
                    <p className="text-xs font-bold text-orange-950">Offered Deal Quote Price</p>
                    <p className="text-[10px] text-orange-700/80">Final agreed pricing from visit assessment</p>
                  </div>
                  <p className="text-2xl font-black text-orange-600">
                    ₹{selectedPreviewQuote?.quote_price ? Number(selectedPreviewQuote.quote_price).toLocaleString('en-IN') : '0'}
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-slate-200 pt-5 text-center mt-12 text-[10px] text-slate-400">
                <p className="font-bold text-slate-600">{vendorProfile?.firm_name || "MAYUKH SOLAR"}</p>
                <p className="mt-0.5">This is a system-generated quotation based on site assessment specs.</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 9. Edit Contact Details Dialog */}
      <Dialog open={isEditContactOpen} onOpenChange={setIsEditContactOpen}>
        <DialogContent className="sm:max-w-[500px] bg-background border border-border shadow-lg p-6 rounded-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Edit className="h-4.5 w-4.5 text-primary" /> Edit Contact Details
            </DialogTitle>
            <DialogDescription>
              Modify customer profile and address details below.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold">Customer Name *</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-10 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Mobile Phone *</Label>
              <Input value={editMobile} onChange={e => setEditMobile(e.target.value)} className="h-10 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Alternate Mobile</Label>
              <Input value={editAltMobile} onChange={e => setEditAltMobile(e.target.value)} className="h-10 text-sm" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold">Email Address</Label>
              <Input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className="h-10 text-sm" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold">Contact Address</Label>
              <Input value={editAddress} onChange={e => setEditAddress(e.target.value)} className="h-10 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Village / City</Label>
              <Input value={editVillageCity} onChange={e => setEditVillageCity(e.target.value)} className="h-10 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">District</Label>
              <Input value={editDistrict} onChange={e => setEditDistrict(e.target.value)} className="h-10 text-sm" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold">State</Label>
              <Input value={editState} onChange={e => setEditState(e.target.value)} className="h-10 text-sm" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" size="sm" onClick={() => setIsEditContactOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveContactDetails} size="sm" className="gradient-primary text-primary-foreground font-semibold">
              Save Contact Details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 10. WhatsApp Phone Prompt Dialog */}
      <Dialog open={isPhonePromptOpen} onOpenChange={setIsPhonePromptOpen}>
        <DialogContent className="sm:max-w-[400px] bg-background border border-border shadow-lg p-6 rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <MessageCircle className="h-4.5 w-4.5 text-emerald-600" /> Send via WhatsApp
            </DialogTitle>
            <DialogDescription>
              Confirm or enter the phone number where you want to send this quotation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Option 1: Send to Lead's Registered Number</p>
              <Button
                type="button"
                onClick={() => {
                  setIsPhonePromptOpen(false);
                  handleSendQuotationWhatsApp(selectedPreviewQuote, lead.mobile);
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center justify-center gap-2 h-11"
              >
                <Phone className="h-4 w-4" />
                Send to {lead.mobile}
              </Button>
            </div>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-border"></div>
              <span className="flex-shrink mx-3 text-[10px] text-muted-foreground font-bold tracking-widest uppercase">OR</span>
              <div className="flex-grow border-t border-border"></div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Option 2: Send to an Alternative Number</p>
              <div className="flex gap-2">
                <Input 
                  value={targetPhone} 
                  onChange={e => setTargetPhone(e.target.value)} 
                  placeholder="Enter 10-digit alternative number" 
                  className="h-10 text-sm flex-1" 
                />
                <Button 
                  onClick={() => {
                    setIsPhonePromptOpen(false);
                    handleSendQuotationWhatsApp(selectedPreviewQuote, targetPhone);
                  }} 
                  disabled={!targetPhone.trim()}
                  size="sm" 
                  className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold h-10 px-4 shrink-0"
                >
                  Send
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-border/40 pt-3">
            <Button variant="ghost" size="sm" onClick={() => setIsPhonePromptOpen(false)} className="w-full">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden print area for background PDF generation */}
      <div 
        style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '210mm', minHeight: '297mm', overflow: 'hidden' }}
        className="bg-white text-slate-800 p-8"
        id="print-quotation-area"
      >
        {selectedPreviewQuote && (
          <div className="space-y-6">
            {/* Header (Letterhead) */}
            <div className="flex justify-between items-start border-b-2 border-orange-500 pb-5">
              <div>
                <h2 className="text-2xl font-extrabold text-orange-600 tracking-wide">
                  {vendorProfile?.firm_name || "MAYUKH SOLAR"}
                </h2>
                <p className="text-[11px] text-slate-500 font-medium">Solar Energy Solutions</p>
                {vendorProfile?.address && <p className="text-[11px] text-slate-500 mt-1 max-w-sm leading-relaxed">{vendorProfile.address}</p>}
                {vendorProfile?.mobile && (
                  <p className="text-[11px] text-slate-500 mt-1 font-semibold">
                    Mob: {vendorProfile.mobile} {vendorProfile.email ? ` | ${vendorProfile.email}` : ""}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-slate-900 uppercase tracking-widest">QUOTATION</p>
                <p className="text-[11px] text-slate-600 mt-1 font-semibold">No: {selectedPreviewQuote.quotation_number}</p>
                <p className="text-[11px] text-slate-500">
                  Date: {selectedPreviewQuote.created_at ? new Date(selectedPreviewQuote.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                </p>
              </div>
            </div>

            {/* Grid for Customer vs System Specs */}
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-slate-200/80 rounded-xl p-4 bg-slate-50/50">
                <h4 className="text-[10px] font-bold text-orange-600 uppercase tracking-wider mb-2">Quotation For</h4>
                <p className="text-sm font-bold text-slate-900">{lead.customer_name}</p>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  {[lead.address, lead.village_city, lead.district, lead.state].filter(Boolean).join(", ")}
                </p>
                {lead.mobile && <p className="text-xs text-slate-900 mt-2 font-semibold">Mob: {lead.mobile}</p>}
              </div>

              <div className="border border-slate-200/80 rounded-xl p-4 bg-slate-50/50">
                <h4 className="text-[10px] font-bold text-orange-600 uppercase tracking-wider mb-2">System Specs</h4>
                <p className="text-sm font-bold text-slate-900">
                  {selectedPreviewQuote.capacity_kw || 'N/A'} kW System ({selectedPreviewQuote.phase || 'N/A'})
                </p>
                <div className="text-xs text-slate-600 mt-2 space-y-1">
                  <p><strong>Panel:</strong> {selectedPreviewQuote.panel_brand || 'N/A'} ({selectedPreviewQuote.panel_watt ? `${selectedPreviewQuote.panel_watt}W` : 'N/A'}) x {selectedPreviewQuote.panel_qty || 'N/A'}</p>
                  <p><strong>Inverter:</strong> {selectedPreviewQuote.inverter_brand || 'N/A'} ({selectedPreviewQuote.inverter_capacity ? `${selectedPreviewQuote.inverter_capacity} kW` : 'N/A'})</p>
                  <p><strong>Cable:</strong> {lead.plant_details?.wiremake || 'Polycab'} ({lead.plant_details?.wire_size || '4 sqmm'} {lead.plant_details?.wire_material || 'Copper'})</p>
                  {selectedPreviewQuote.structure_type && (
                    <p><strong>Structure:</strong> {selectedPreviewQuote.structure_type}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Pricing Table */}
            <div className="space-y-2 pt-2">
              <h4 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider border-b pb-1">Cost &amp; Subsidy Breakdown</h4>
              <table className="w-full text-xs text-left border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-orange-50/80 text-orange-950 font-bold">
                    <th className="p-2.5 border border-slate-200">Description</th>
                    <th className="p-2.5 border border-slate-200 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2.5 border border-slate-200">Solar Power Plant Setup (Turnkey Cost)</td>
                    <td className="p-2.5 border border-slate-200 text-right font-medium">
                      {selectedPreviewQuote.total_cost ? Number(selectedPreviewQuote.total_cost).toLocaleString('en-IN') : '0'}
                    </td>
                  </tr>
                  {!!selectedPreviewQuote.subsidy_amount && (
                    <tr>
                      <td className="p-2.5 border border-slate-200 text-emerald-700 font-semibold">Central Government Subsidy Benefit</td>
                      <td className="p-2.5 border border-slate-200 text-right text-emerald-700 font-semibold">- {Number(selectedPreviewQuote.subsidy_amount).toLocaleString('en-IN')}</td>
                    </tr>
                  )}
                  <tr className="bg-slate-50 font-bold text-slate-900">
                    <td className="p-2.5 border border-slate-200">Net Cost to Customer</td>
                    <td className="p-2.5 border border-slate-200 text-right text-slate-950">
                      ₹{selectedPreviewQuote.net_cost ? Number(selectedPreviewQuote.net_cost).toLocaleString('en-IN') : '0'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Quotation Price offered */}
            <div className="p-4 bg-orange-50 border border-orange-200/80 rounded-xl flex justify-between items-center mt-4">
              <div>
                <p className="text-xs font-bold text-orange-950">Offered Deal Quote Price</p>
                <p className="text-[10px] text-orange-700/80">Final agreed pricing from visit assessment</p>
              </div>
              <p className="text-2xl font-black text-orange-600">
                ₹{selectedPreviewQuote.quote_price ? Number(selectedPreviewQuote.quote_price).toLocaleString('en-IN') : '0'}
              </p>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 pt-5 text-center mt-12 text-[10px] text-slate-400">
              <p className="font-bold text-slate-600">{vendorProfile?.firm_name || "MAYUKH SOLAR"}</p>
              <p className="mt-0.5">This is a system-generated quotation based on site assessment specs.</p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default LeadDetail;
