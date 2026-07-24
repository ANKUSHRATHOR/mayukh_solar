import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Loader2, Trash2, Plus, Calendar, Building, User, Wallet, Info } from 'lucide-react';

interface Payment {
  id: string;
  source: 'customer' | 'bank';
  amount: number;
  payment_date: string;
  payment_mode: 'cash' | 'bank_transfer' | 'cheque' | 'upi' | 'other';
  reference_number: string | null;
  status: 'pending' | 'completed' | 'rejected';
  notes: string | null;
}

interface ManagePaymentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  finalAmount: number;
  paymentType: 'cash' | 'loan' | string;
  customerName: string;
}

export default function ManagePaymentsDialog({
  open,
  onOpenChange,
  projectId,
  finalAmount,
  paymentType,
  customerName,
}: ManagePaymentsDialogProps) {
  const { toast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<Payment['payment_mode']>('bank_transfer');
  const [source, setSource] = useState<Payment['source']>('customer');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_payments')
        .select('*')
        .eq('project_id', projectId)
        .order('payment_date', { ascending: false });

      if (error) throw error;
      setPayments((data as any[]) || []);
    } catch (err: any) {
      toast({
        title: 'Error loading payments',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    if (open) {
      fetchPayments();
      // Reset form defaults
      setAmount('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setPaymentMode('bank_transfer');
      setSource('customer');
      setReferenceNumber('');
      setNotes('');
    }
  }, [open, fetchPayments]);

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Please enter a valid amount greater than zero.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('project_payments')
        .insert({
          project_id: projectId,
          amount: parsedAmount,
          payment_date: paymentDate,
          payment_mode: paymentMode,
          source: paymentType === 'cash' ? 'customer' : source,
          reference_number: referenceNumber.trim() || null,
          notes: notes.trim() || null,
          status: 'completed', // auto-complete payments logged by staff
        });

      if (error) throw error;

      toast({
        title: 'Payment added successfully!',
        description: `Recorded ₹${parsedAmount.toLocaleString('en-IN')} from ${
          paymentType === 'cash' ? 'Customer' : source === 'customer' ? 'Customer' : 'Bank'
        }.`,
      });

      // Reset form fields
      setAmount('');
      setReferenceNumber('');
      setNotes('');
      fetchPayments();
    } catch (err: any) {
      toast({
        title: 'Failed to record payment',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePayment = async (id: string, payAmount: number) => {
    if (!confirm(`Are you sure you want to delete this payment of ₹${payAmount.toLocaleString('en-IN')}?`)) return;

    try {
      const { error } = await supabase
        .from('project_payments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Payment deleted',
      });
      fetchPayments();
    } catch (err: any) {
      toast({
        title: 'Delete failed',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  // Calculations
  const totalPaid = payments
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0);

  const balanceDue = finalAmount - totalPaid;

  const totalCustomerPaid = payments
    .filter(p => p.status === 'completed' && p.source === 'customer')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalBankPaid = payments
    .filter(p => p.status === 'completed' && p.source === 'bank')
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-background border border-border shadow-lg p-6 sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground font-bold">
            <Wallet className="h-5 w-5 text-primary" /> Payments & Finances
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs mt-1">
            Manage incoming payments and financial tracking for deal: <strong>{customerName}</strong>
          </DialogDescription>
        </DialogHeader>

        {/* Financial Summary */}
        <div className="grid grid-cols-3 gap-3 p-3.5 bg-muted/40 rounded-xl border border-border/40 mt-2">
          <div className="text-center sm:text-left">
            <p className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">Deal Amount</p>
            <p className="text-base font-bold text-foreground mt-0.5">₹{finalAmount.toLocaleString('en-IN')}</p>
          </div>
          <div className="text-center sm:text-left border-x px-3 border-border/40">
            <p className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">Total Paid</p>
            <p className="text-base font-bold text-emerald-600 mt-0.5">₹{totalPaid.toLocaleString('en-IN')}</p>
            {paymentType === 'loan' && (
              <p className="text-[9px] text-muted-foreground mt-0.5">
                Cust: ₹{totalCustomerPaid.toLocaleString('en-IN')} | Bank: ₹{totalBankPaid.toLocaleString('en-IN')}
              </p>
            )}
          </div>
          <div className="text-center sm:text-left">
            <p className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">Balance Due</p>
            <p className={`text-base font-bold mt-0.5 ${balanceDue > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              ₹{balanceDue.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 mt-4">
          {/* Left Column: Form */}
          <form onSubmit={handleAddPayment} className="md:col-span-5 space-y-3.5 border-r pr-0 md:pr-5 border-border/40">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1">
              <Plus className="h-3.5 w-3.5" /> Record Payment
            </h3>

            {paymentType === 'loan' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Payment Source</Label>
                <Select value={source} onValueChange={(v: any) => setSource(v)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">
                      <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Customer (Margin Money)</span>
                    </SelectItem>
                    <SelectItem value="bank">
                      <span className="flex items-center gap-1.5"><Building className="h-3.5 w-3.5" /> Bank (Loan Disbursal)</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Payment Amount (₹) *</Label>
              <Input
                type="number"
                placeholder="Amount"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="h-9 text-xs"
                required
                min={1}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Payment Date *</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                className="h-9 text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Payment Mode</Label>
              <Select value={paymentMode} onValueChange={(v: any) => setPaymentMode(v)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="upi">UPI / Online</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Reference Number</Label>
              <Input
                placeholder="e.g. Txn / Cheque No"
                value={referenceNumber}
                onChange={e => setReferenceNumber(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes / Details</Label>
              <Textarea
                placeholder="Additional info..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="text-xs resize-none"
              />
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-9 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Record Payment
            </Button>
          </form>

          {/* Right Column: List of Payments */}
          <div className="md:col-span-7 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Payment History
            </h3>

            {loading ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                Loading history...
              </div>
            ) : payments.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground border border-dashed rounded-xl bg-muted/10">
                <Info className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground/60" />
                No payments recorded yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {payments.map(p => (
                  <div
                    key={p.id}
                    className="p-3 border border-border/60 rounded-xl bg-card hover:bg-muted/10 transition-all flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-foreground">₹{p.amount.toLocaleString('en-IN')}</span>
                        <span className="text-[10px] font-mono text-muted-foreground uppercase border px-1.5 py-0.5 rounded bg-muted/30">
                          {p.payment_mode.replace('_', ' ')}
                        </span>
                        {paymentType === 'loan' && (
                          <span className={`text-[9px] font-semibold px-1 rounded-sm ${p.source === 'bank' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                            {p.source.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-0.5"><Calendar className="h-3 w-3" /> {new Date(p.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        {p.reference_number && <span>• Ref: {p.reference_number}</span>}
                      </div>
                      {p.notes && <p className="text-[10px] text-muted-foreground/80 italic truncate max-w-[250px]">{p.notes}</p>}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => handleDeletePayment(p.id, p.amount)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
