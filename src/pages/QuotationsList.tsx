import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import StatCard from '@/components/dashboard/StatCard';
import { Search, FileText, User, Phone, MapPin, Calendar, IndianRupee, Zap, Loader2, Download, Printer, Share2, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { downloadCsv } from '@/lib/exportCsv';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const QuotationsList = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [openQ, setOpenQ] = useState<any | null>(null);
  const [html, setHtml] = useState<string>('');
  const [loadingHtml, setLoadingHtml] = useState(false);
  const { toast } = useToast();

  const openQuotation = async (q: any) => {
    setOpenQ(q); setHtml(''); setLoadingHtml(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-quotation', { body: { projectId: q.project_id } });
      if (error) throw error;
      if (!data?.html) throw new Error('No quotation generated');
      setHtml(data.html);
    } catch (e: any) {
      toast({ title: 'Failed to open quotation', description: e.message, variant: 'destructive' });
      setOpenQ(null);
    } finally { setLoadingHtml(false); }
  };

  const openInNewTab = () => {
    if (!html) return;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const printQuotation = () => {
    const iframe = document.getElementById('quotation-frame') as HTMLIFrameElement | null;
    iframe?.contentWindow?.focus();
    iframe?.contentWindow?.print();
  };

  const downloadHtml = () => {
    if (!openQ) return;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${openQ.quotation_number || 'quotation'}.html`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const shareQuotation = async () => {
    if (!openQ) return;
    const text = `Quotation ${openQ.quotation_number} for ${openQ.customer_name} — ₹${Number(openQ.total_amount).toLocaleString('en-IN')}`;
    try {
      if (navigator.share) await navigator.share({ title: openQ.quotation_number, text });
      else { await navigator.clipboard.writeText(text); toast({ title: 'Copied to clipboard' }); }
    } catch { /* user cancelled */ }
  };


  const { data: quotations, isLoading } = useQuery({
    queryKey: ['quotations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = quotations?.filter((q) => {
    const term = searchTerm.toLowerCase();
    return (
      (q.quotation_number ?? '').toLowerCase().includes(term) ||
      (q.customer_name ?? '').toLowerCase().includes(term) ||
      (q.customer_mobile && q.customer_mobile.includes(term)) ||
      (q.project_code ?? '').toLowerCase().includes(term)
    );
  });

  // Dedupe by project_id (latest quotation per project) for accurate totals
  const dedupedByProject = (() => {
    const map = new Map<string, typeof quotations[number]>();
    (quotations || []).forEach((q) => {
      if (!q.project_id) return;
      const existing = map.get(q.project_id);
      if (!existing || new Date(q.created_at) > new Date(existing.created_at)) {
        map.set(q.project_id, q);
      }
    });
    return Array.from(map.values());
  })();
  const totalValue = dedupedByProject.reduce((sum, q) => sum + Number(q.total_amount ?? 0), 0);
  const totalCapacity = dedupedByProject.reduce((sum, q) => sum + Number(q.capacity_kw ?? 0), 0);
  const uniqueProjectsCount = dedupedByProject.length;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quotations</h1>
          <p className="text-sm text-muted-foreground mt-1">Search and review generated customer quotations</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title="Unique Projects Quoted" value={String(uniqueProjectsCount)} icon={FileText} change="" changeType="neutral" />
          <StatCard title="Quoted Value" value={`₹${(totalValue / 100000).toFixed(1)}L`} icon={IndianRupee} change="" changeType="neutral" />
          <StatCard title="System Capacity" value={`${totalCapacity.toFixed(1)} kW`} icon={Zap} change="" changeType="neutral" />
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by QT number, customer name, mobile, project code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline" onClick={() => downloadCsv('quotations.csv', [
            { header: 'Date', value: (q: any) => new Date(q.created_at).toLocaleString() },
            { header: 'QT Number', value: (q: any) => q.quotation_number },
            { header: 'Project Code', value: (q: any) => q.project_code },
            { header: 'Customer', value: (q: any) => q.customer_name },
            { header: 'Mobile', value: (q: any) => q.customer_mobile || '' },
            { header: 'Address', value: (q: any) => q.customer_address || '' },
            { header: 'Capacity kW', value: (q: any) => q.capacity_kw },
            { header: 'Total (₹)', value: (q: any) => q.total_amount },
          ], filtered || [])} disabled={!filtered?.length}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center min-h-[40vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : !filtered?.length ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">{searchTerm ? 'No quotations found matching your search.' : 'No quotations generated yet.'}</CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((q) => (
              <Card
                key={q.id}
                role="button"
                tabIndex={0}
                onClick={() => openQuotation(q)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openQuotation(q); } }}
                className="cursor-pointer overflow-hidden border-border bg-card shadow-card transition-shadow hover:shadow-elevated focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="min-w-0 text-base flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="truncate">{q.quotation_number ?? 'No quotation number'}</span>
                    </CardTitle>
                    <Badge variant="outline" className="shrink-0">{q.project_code ?? 'No project code'}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium truncate">{q.customer_name ?? 'Unknown customer'}</span>
                  </div>
                  {q.customer_mobile && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{q.customer_mobile}</span>
                    </div>
                  )}
                  {q.customer_address && (
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-muted-foreground truncate">{q.customer_address}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">{format(new Date(q.created_at), 'dd MMM yyyy')}</span>
                    </div>
                    <span className="font-semibold text-primary">₹{Number(q.total_amount ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{q.capacity_kw ?? '—'} kW System</span>
                    <span className="inline-flex items-center gap-1 text-primary"><ExternalLink className="h-3 w-3" /> Open</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!openQ} onOpenChange={(o) => { if (!o) { setOpenQ(null); setHtml(''); } }}>
          <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 flex flex-col">
            <DialogHeader className="px-4 py-3 border-b border-border">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <DialogTitle className="text-base truncate">
                  {openQ?.quotation_number} — {openQ?.customer_name}
                </DialogTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={openInNewTab} disabled={!html}><ExternalLink className="h-4 w-4 mr-1" />Open</Button>
                  <Button size="sm" variant="outline" onClick={printQuotation} disabled={!html}><Printer className="h-4 w-4 mr-1" />Print / Save PDF</Button>
                  <Button size="sm" variant="outline" onClick={downloadHtml} disabled={!html}><Download className="h-4 w-4 mr-1" />Download</Button>
                  <Button size="sm" variant="outline" onClick={shareQuotation}><Share2 className="h-4 w-4 mr-1" />Share</Button>
                </div>
              </div>
            </DialogHeader>
            <div className="flex-1 bg-muted overflow-hidden">
              {loadingHtml ? (
                <div className="h-full flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : html ? (
                <iframe id="quotation-frame" title="Quotation" srcDoc={html} className="w-full h-full bg-white" />
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );
};

export default QuotationsList;
