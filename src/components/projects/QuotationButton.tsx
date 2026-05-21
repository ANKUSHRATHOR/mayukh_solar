import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { FileText, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  projectId: string;
  size?: 'sm' | 'default';
  className?: string;
}

type QType = 'bank' | 'consumer';

const QuotationButton = ({ projectId, size = 'sm', className }: Props) => {
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [qType, setQType] = useState<QType>('consumer');
  const [bankId, setBankId] = useState<string>('');
  const [banks, setBanks] = useState<any[]>([]);
  const { toast } = useToast();

  const allowed = role === 'admin' || role === 'operator' || role === 'sales_person';
  if (!allowed) return null;

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from('vendor_bank_accounts' as any)
        .select('id, bank_name, holder_name, account_no, ifsc, is_default')
        .eq('is_active', true)
        .order('is_default', { ascending: false });
      const list = (data as any[]) || [];
      setBanks(list);
      const def = list.find((b) => b.is_default) || list[0];
      if (def && !bankId) setBankId(def.id);
    })();
  }, [open]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-quotation', {
        body: { projectId, quotationType: qType, bankAccountId: bankId || null },
      });
      if (error) throw error;
      if (!data?.html) throw new Error('No quotation generated');

      const win = window.open('', '_blank');
      if (win) {
        win.document.write(data.html);
        win.document.close();
        setTimeout(() => win.print(), 300);
      }
      setOpen(false);
    } catch (err: any) {
      toast({ title: 'Error generating quotation', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="outline" size={size} onClick={() => setOpen(true)} className={className}>
        <FileText className="h-3 w-3 mr-1" /> Quotation
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Quotation</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Quotation type</Label>
              <RadioGroup value={qType} onValueChange={(v) => setQType(v as QType)} className="grid grid-cols-2 gap-2">
                <label className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer ${qType==='bank'?'border-primary bg-accent/40':'border-border'}`}>
                  <RadioGroupItem value="bank" id="qt-bank" className="mt-1" />
                  <div>
                    <div className="font-semibold text-sm">Bank</div>
                    <div className="text-xs text-muted-foreground">100% Advance (Bank Disbursement)</div>
                  </div>
                </label>
                <label className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer ${qType==='consumer'?'border-primary bg-accent/40':'border-border'}`}>
                  <RadioGroupItem value="consumer" id="qt-consumer" className="mt-1" />
                  <div>
                    <div className="font-semibold text-sm">Consumer</div>
                    <div className="text-xs text-muted-foreground">30% / 60% / 10%</div>
                  </div>
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>Bank account on quotation (optional)</Label>
              {banks.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No bank accounts configured yet. Admin can add them in Admin Settings → Bank Accounts.
                  The default vendor bank fields will be used.
                </p>
              ) : (
                <Select value={bankId} onValueChange={setBankId}>
                  <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
                  <SelectContent>
                    {banks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.bank_name} — {b.account_no} {b.is_default ? '(default)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={loading} className="gradient-primary text-primary-foreground">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default QuotationButton;
