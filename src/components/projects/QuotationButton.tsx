import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, ExternalLink, Printer, Download, Share2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

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
  const [tab, setTab] = useState<'history' | 'generate'>('history');
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewerQ, setViewerQ] = useState<any | null>(null);
  const [viewerHtml, setViewerHtml] = useState<string>('');
  const [viewerLoading, setViewerLoading] = useState(false);
  const { toast } = useToast();

  const allowed = role === 'admin' || role === 'operator' || role === 'sales_person';
  if (!allowed) return null;

  const loadHistory = async () => {
    setHistoryLoading(true);
    const { data } = await supabase
      .from('quotations')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    setHistory((data as any[]) || []);
    setHistoryLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    loadHistory();
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

  useEffect(() => {
    if (!open) { setTab('history'); setViewerQ(null); setViewerHtml(''); }
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
      await loadHistory();
      setTab('history');
    } catch (err: any) {
      toast({ title: 'Error generating quotation', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openViewer = async (q: any) => {
    setViewerQ(q); setViewerHtml(''); setViewerLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-quotation', { body: { quotationId: q.id } });
      if (error) throw error;
      setViewerHtml(data?.html || '');
    } catch (e: any) {
      toast({ title: 'Failed to open quotation', description: e.message, variant: 'destructive' });
      setViewerQ(null);
    } finally { setViewerLoading(false); }
  };

  const printViewer = () => {
    const iframe = document.getElementById('qb-viewer-frame') as HTMLIFrameElement | null;
    iframe?.contentWindow?.focus();
    iframe?.contentWindow?.print();
  };

  const openViewerNewTab = () => {
    if (!viewerHtml) return;
    const w = window.open('', '_blank');
    if (w) { w.document.write(viewerHtml); w.document.close(); }
  };

  const downloadViewer = () => {
    if (!viewerQ) return;
    const blob = new Blob([viewerHtml], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${viewerQ.quotation_number || 'quotation'}.html`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const shareViewer = async () => {
    if (!viewerQ) return;
    const text = `Quotation ${viewerQ.quotation_number} for ${viewerQ.customer_name} — ₹${Number(viewerQ.total_amount).toLocaleString('en-IN')}`;
    try {
      if (navigator.share) await navigator.share({ title: viewerQ.quotation_number, text });
      else { await navigator.clipboard.writeText(text); toast({ title: 'Copied to clipboard' }); }
    } catch { /* user cancelled */ }
  };

  return (
    <>
      <Button variant="outline" size={size} onClick={() => setOpen(true)} className={className}>
        <FileText className="h-3 w-3 mr-1" /> Quotation
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Quotations</DialogTitle>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="history">History {history.length > 0 && <Badge variant="secondary" className="ml-2">{history.length}</Badge>}</TabsTrigger>
              <TabsTrigger value="generate">Generate New</TabsTrigger>
            </TabsList>

            <TabsContent value="history" className="space-y-2 max-h-[50vh] overflow-y-auto">
              {historyLoading ? (
                <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : history.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No quotations generated yet.</p>
              ) : history.map((q) => (
                <button
                  key={q.id}
                  onClick={() => openViewer(q)}
                  className="w-full text-left rounded-md border border-border p-3 hover:bg-accent/40 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{q.quotation_number}</span>
                    <span className="text-sm font-semibold text-primary">₹{Number(q.total_amount ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                    <span>{format(new Date(q.created_at), 'dd MMM yyyy, HH:mm')}</span>
                    <span>{q.capacity_kw ?? '—'} kW</span>
                  </div>
                </button>
              ))}
            </TabsContent>

            <TabsContent value="generate" className="space-y-4">
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

              <Button onClick={handleGenerate} disabled={loading} className="w-full gradient-primary text-primary-foreground">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
                Generate Quotation
              </Button>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewerQ} onOpenChange={(o) => { if (!o) { setViewerQ(null); setViewerHtml(''); } }}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 flex flex-col">
          <DialogHeader className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <DialogTitle className="text-base truncate">
                {viewerQ?.quotation_number} — {viewerQ?.customer_name}
              </DialogTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={openViewerNewTab} disabled={!viewerHtml}><ExternalLink className="h-4 w-4 mr-1" />Open</Button>
                <Button size="sm" variant="outline" onClick={printViewer} disabled={!viewerHtml}><Printer className="h-4 w-4 mr-1" />Print</Button>
                <Button size="sm" variant="outline" onClick={downloadViewer} disabled={!viewerHtml}><Download className="h-4 w-4 mr-1" />Download</Button>
                <Button size="sm" variant="outline" onClick={shareViewer}><Share2 className="h-4 w-4 mr-1" />Share</Button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 bg-muted overflow-hidden">
            {viewerLoading ? (
              <div className="h-full flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : viewerHtml ? (
              <iframe id="qb-viewer-frame" title="Quotation" srcDoc={viewerHtml} className="w-full h-full bg-white" />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default QuotationButton;

