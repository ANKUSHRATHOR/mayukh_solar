import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { FileText, Loader2, Phone, MapPin, Briefcase, ChevronRight, CheckCircle2, XCircle, Search, Edit, CreditCard } from 'lucide-react';
import QuotationButton from '@/components/projects/QuotationButton';
import DocumentPoolDialog from '@/components/projects/DocumentPoolDialog';
import ManagePaymentsDialog from '@/components/projects/ManagePaymentsDialog';

interface DealProject {
  id: string;
  project_code: string;
  capacity_kw: number;
  panel_brand: string;
  panel_qty: number;
  panel_watt: number;
  inverter_brand: string;
  inverter_capacity: number;
  structure_type: string;
  final_amount: number;
  discount: number;
  payment_type: string;
  loan_bank: string | null;
  lead_id: string;
  k_number: string | null;
  status: string | null;
  leads: {
    id: string;
    customer_name: string;
    mobile: string;
    email: string | null;
    address: string;
    village_city: string;
    district: string;
    state: string;
    status: string;
    quotation_details: any;
  };
}

export default function DealsDashboard() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [deals, setDeals] = useState<DealProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Dialog states
  const [selectedDeal, setSelectedDeal] = useState<DealProject | null>(null);
  const [isDocOpen, setIsDocOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isPaymentsOpen, setIsPaymentsOpen] = useState(false);
  
  // Approval Form State
  const [payType, setPayType] = useState<'cash' | 'loan' | 'loan_cash'>('cash');
  const [loanBank, setLoanBank] = useState('');
  const [approving, setApproving] = useState(false);
  const [dealTab, setDealTab] = useState<'pipeline' | 'won' | 'all'>('pipeline');

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    try {
      // No status filter. This previously pinned to leads.status = 'interested',
      // so a deal disappeared the moment it progressed — including on the very
      // action that approved it, which sets the lead to 'final'. Every project
      // is a deal; the tabs below split them by stage instead.
      const { data, error } = await supabase
        .from('projects')
        .select(`
          id,
          project_code,
          capacity_kw,
          panel_brand,
          panel_qty,
          panel_watt,
          inverter_brand,
          inverter_capacity,
          structure_type,
          final_amount,
          discount,
          payment_type,
          loan_bank,
          lead_id,
          k_number,
          status,
          leads!inner(
            id,
            customer_name,
            mobile,
            email,
            address,
            village_city,
            district,
            state,
            status,
            quotation_details
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDeals((data as any[]) || []);
    } catch (err: any) {
      toast({ title: 'Error loading deals', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  const handleApproveDeal = async () => {
    if (!selectedDeal) return;
    
    if ((payType === 'loan' || payType === 'loan_cash') && !loanBank.trim()) {
      toast({ title: 'Bank name required', description: 'Please type the bank name for loan processing.', variant: 'destructive' });
      return;
    }

    setApproving(true);
    try {
      // Stages on the 12-stage pipeline. These previously wrote the legacy
      // 'material_ordered' / 'loan_process' values, which put a freshly
      // approved deal off-pipeline — no progress bar, no valid next step.
      const mappedPayType = payType === 'loan_cash' ? 'loan' : payType; // loan+cash is saved as loan with special notes
      const initialProjectStatus =
        payType === 'cash' ? 'documents_approved' : 'loan_application_pending';

      // 2. Update projects table
      const { error: projErr } = await supabase
        .from('projects')
        .update({
          payment_type: mappedPayType as any,
          loan_bank: payType !== 'cash' ? loanBank.trim() : null,
          status: initialProjectStatus as any,
          loan_disbursed: payType === 'cash', // Cash is immediately ready, Loan starts false
          special_notes: payType === 'loan_cash' 
            ? `Loan + Cash combination deal. ${selectedDeal.inverter_brand || ''}` 
            : null
        })
        .eq('id', selectedDeal.id);

      if (projErr) throw projErr;

      // 3. Update leads table status to final
      const { error: leadErr } = await supabase
        .from('leads')
        .update({ status: 'final' })
        .eq('id', selectedDeal.lead_id);

      if (leadErr) throw leadErr;

      toast({
        title: 'Deal Approved!',
        description: payType === 'cash' 
          ? 'Cash project moved to Documents Approved.'
          : `Loan project moved to Loan Application Pending with ${loanBank}.`
      });

      setIsApproveOpen(false);
      setSelectedDeal(null);
      fetchDeals();
    } catch (err: any) {
      toast({ title: 'Approval failed', description: err.message, variant: 'destructive' });
    } finally {
      setApproving(false);
    }
  };

  const handleRevertDeal = async (deal: DealProject) => {
    if (!confirm(`Move "${deal.leads.customer_name}" back to leads pipeline?`)) return;
    try {
      const { error } = await supabase
        .from('leads')
        .update({ status: 'follow_up' })
        .eq('id', deal.lead_id);

      if (error) throw error;
      toast({ title: 'Deal reverted to leads list' });
      fetchDeals();
    } catch (err: any) {
      toast({ title: 'Revert failed', description: err.message, variant: 'destructive' });
    }
  };

  // "Won" = the project reached completion. Everything else that exists as a
  // project is still in the pipeline.
  const WON_STAGES = ['project_completed', 'closed'];
  const isWon = (deal: DealProject) => WON_STAGES.includes(deal.status ?? '');

  const searchMatches = (deal: DealProject) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (deal.k_number ?? '').toLowerCase().includes(q) ||
      deal.leads.customer_name.toLowerCase().includes(q) ||
      deal.leads.mobile.includes(q) ||
      (deal.leads.email || '').toLowerCase().includes(q)
    );
  };

  const pipelineCount = deals.filter((d) => !isWon(d)).length;
  const wonCount = deals.filter(isWon).length;

  const filteredDeals = deals.filter((deal) => {
    if (!searchMatches(deal)) return false;
    if (dealTab === 'pipeline') return !isWon(deal);
    if (dealTab === 'won') return isWon(deal);
    return true;
  });

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6 animate-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-display text-foreground tracking-tight">Deals Dashboard</h1>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search deals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8.5 text-xs rounded-lg"
          />
        </div>
      </div>

      {/* A converted deal used to vanish from this page entirely. These tabs
          keep it visible and split by whether the work is still running. */}
      <div className="flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-border/70 bg-muted/30 p-1">
        {([
          { v: 'pipeline', l: 'In Pipeline', c: pipelineCount },
          { v: 'won', l: 'Won', c: wonCount },
          { v: 'all', l: 'All Deals', c: deals.length },
        ] as const).map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => setDealTab(t.v)}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
              dealTab === t.v
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}
          >
            {t.l}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                dealTab === t.v
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {t.c}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="border rounded-xl p-12 text-center text-muted-foreground bg-card">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
          Loading active deals...
        </div>
      ) : filteredDeals.length === 0 ? (
        <div className="border rounded-xl p-12 text-center text-muted-foreground bg-card">
          {search ? 'No deals match your search.' : 'No active deals. Convert a lead to Interested to see it here.'}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse text-muted-foreground">
              <thead className="text-xs font-mono uppercase bg-muted/40 border-b text-foreground">
                <tr>
                  {/* K-Number identifies the connection; the internal deal
                      code is not a user-facing identifier. */}
                  <th className="px-4 py-3.5 font-semibold">K Number</th>
                  <th className="px-4 py-3.5 font-semibold">Customer Details</th>
                  <th className="px-4 py-3.5 font-semibold">Plant Specs</th>
                  <th className="px-4 py-3.5 font-semibold">Pipeline Stage</th>
                  <th className="px-4 py-3.5 font-semibold">Price Quotes</th>
                  <th className="px-4 py-3.5 font-semibold text-center">Docs Pool</th>
                  <th className="px-4 py-3.5 font-semibold text-center">Quotation</th>
                  <th className="px-4 py-3.5 font-semibold text-center">Payments</th>
                  <th className="px-4 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y border-b">
                {filteredDeals.map((deal) => {
                  const quotes = Array.isArray(deal.leads?.quotation_details) ? deal.leads.quotation_details : [];
                  const approvedQuote = quotes.find((q: any) => q.status === 'accepted') || quotes[0];
                  
                  return (
                    <tr key={deal.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-3 text-xs font-mono font-bold text-foreground">
                        {deal.k_number ?? (
                          <span className="font-normal text-muted-foreground/60">Not linked</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{deal.leads.customer_name}</div>
                        <div className="flex flex-wrap items-center gap-x-2 text-xs mt-0.5">
                          <a href={`tel:${deal.leads.mobile}`} className="text-primary hover:underline font-semibold">
                            {deal.leads.mobile}
                          </a>
                          {deal.leads.email && <span className="text-muted-foreground">• {deal.leads.email}</span>}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed max-w-[220px]">
                          <MapPin className="inline h-3 w-3 mr-0.5 text-muted-foreground/75 shrink-0" />
                          {[deal.leads.address, deal.leads.village_city, deal.leads.district].filter(Boolean).join(", ")}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground">
                        <div className="font-medium">{deal.capacity_kw} kW System</div>
                        <div className="text-muted-foreground text-[10px] mt-0.5">
                          {deal.panel_qty}x {deal.panel_watt}W {deal.panel_brand}
                        </div>
                        <div className="text-muted-foreground text-[10px]">
                          Inv: {deal.inverter_capacity}kW {deal.inverter_brand}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] font-bold uppercase shrink-0 ${
                          deal.status === 'project_completed'
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-none'
                            : deal.status === 'inspection_failed'
                            ? 'bg-red-100 text-red-800 hover:bg-red-100 border-none'
                            : deal.status === 'pending_documents' || deal.status === 'pending_operator_review'
                            ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100 border-none'
                            : deal.status === 'net_meter_installed' || deal.status === 'net_metering_submitted'
                            ? 'bg-blue-100 text-blue-800 hover:bg-blue-100 border-none'
                            : 'bg-orange-100 text-orange-800 hover:bg-orange-100 border-none'
                        }`}>
                          {deal.status?.replace(/_/g, ' ') || 'Pending'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground">
                        <div className="font-bold">₹{Number(deal.final_amount ?? 0).toLocaleString('en-IN')}</div>
                        {approvedQuote && (
                          <div className="text-[10px] text-muted-foreground mt-1 space-y-0.5 font-normal">
                            <div>Turnkey: ₹{Number(approvedQuote.total_cost ?? 0).toLocaleString('en-IN')}</div>
                            {approvedQuote.subsidy_amount > 0 && (
                              <div className="text-emerald-600">Subsidy: -₹{Number(approvedQuote.subsidy_amount).toLocaleString('en-IN')}</div>
                            )}
                            <div>Quote Code: <span className="font-mono text-[9px]">{approvedQuote.quotation_number}</span></div>
                          </div>
                        )}
                        {deal.discount > 0 && (
                          <div className="text-[10px] text-emerald-500 font-normal mt-0.5">Discount: ₹{deal.discount.toLocaleString('en-IN')}</div>
                        )}
                      </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-8"
                        onClick={() => {
                          setSelectedDeal(deal);
                          setIsDocOpen(true);
                        }}
                      >
                        Upload Docs
                      </Button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <QuotationButton projectId={deal.id} size="sm" className="h-8" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-8 gap-1.5"
                        onClick={() => {
                          setSelectedDeal(deal);
                          setIsPaymentsOpen(true);
                        }}
                      >
                        <CreditCard className="h-3.5 w-3.5" /> Payments
                      </Button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => navigate(`/projects/${deal.id}/edit`)}
                          title="Edit Equipment details"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => handleRevertDeal(deal)}
                        >
                          Revert
                        </Button>
                        <Button
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
                          onClick={() => {
                            setSelectedDeal(deal);
                            setPayType((deal.payment_type as any) || 'cash');
                            setLoanBank(deal.loan_bank || '');
                            setIsApproveOpen(true);
                          }}
                        >
                          Approve Deal
                        </Button>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Document Pool Dialog */}
      {selectedDeal && (
        <DocumentPoolDialog
          open={isDocOpen}
          onOpenChange={setIsDocOpen}
          projectId={selectedDeal.id}
          leadId={selectedDeal.lead_id}
          title={`Document Pool: ${selectedDeal.leads.customer_name}`}
        />
      )}

      {/* Manage Payments Dialog */}
      {selectedDeal && (
        <ManagePaymentsDialog
          open={isPaymentsOpen}
          onOpenChange={setIsPaymentsOpen}
          projectId={selectedDeal.id}
          finalAmount={selectedDeal.final_amount}
          paymentType={selectedDeal.payment_type || 'cash'}
          customerName={selectedDeal.leads.customer_name}
        />
      )}

      {/* Deal Approval Modal */}
      <Dialog open={isApproveOpen} onOpenChange={setIsApproveOpen}>
        <DialogContent className="max-w-md sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" /> Approve Deal & Create Project
            </DialogTitle>
            <DialogDescription>
              Confirm the final payment type for {selectedDeal?.leads.customer_name}. Approving will move this deal to operations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment Type</Label>
              <RadioGroup value={payType} onValueChange={(v: any) => setPayType(v)} className="grid grid-cols-1 gap-2">
                <label className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all ${payType === 'cash' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <RadioGroupItem value="cash" className="mt-1" />
                  <div>
                    <div className="font-semibold text-sm">Cash Project</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Project starts immediately. Status transitions to active fabrication.</div>
                  </div>
                </label>
                <label className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all ${payType === 'loan' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <RadioGroupItem value="loan" className="mt-1" />
                  <div>
                    <div className="font-semibold text-sm">Loan Project</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Project starts after loan is disbursed by the bank.</div>
                  </div>
                </label>
                <label className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all ${payType === 'loan_cash' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <RadioGroupItem value="loan_cash" className="mt-1" />
                  <div>
                    <div className="font-semibold text-sm">Loan + Cash combination</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Part payment via cash, balance bank loan. Starts after loan disbursed.</div>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {/* Bank details field */}
            {(payType === 'loan' || payType === 'loan_cash') && (
              <div className="space-y-1.5 animate-in-fade">
                <Label className="text-xs font-bold">Financing Bank Name *</Label>
                <Input
                  placeholder="e.g. SBI, HDFC, AU Small Finance"
                  value={loanBank}
                  onChange={(e) => setLoanBank(e.target.value)}
                  className="h-11"
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setIsApproveOpen(false)} disabled={approving}>Cancel</Button>
            <Button
              onClick={handleApproveDeal}
              disabled={approving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
            >
              {approving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Confirm & Start Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
