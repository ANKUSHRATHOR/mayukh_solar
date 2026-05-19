// Admin: Upload a vendor quotation PDF, extract details via edge function, save as vendor profile.
import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, Save, Loader2 } from 'lucide-react';

const fields: [string, string][] = [
  ['firm_name', 'Firm name'], ['gstin', 'GSTIN'], ['mobile', 'Mobile'], ['email', 'Email'],
  ['license_no', 'License number'], ['bank_name', 'Bank name'], ['account_no', 'Account number'],
  ['ifsc', 'IFSC'], ['account_type', 'Account type'],
];

const QuotationImport = () => {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [vendor, setVendor] = useState<any>({});
  const [preview, setPreview] = useState<string>('');
  const [makeDefault, setMakeDefault] = useState(true);

  const onFile = async (file: File) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast({ title: 'PDF too large (max 8MB)', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      const { data, error } = await supabase.functions.invoke('parse-quotation-pdf', { body: { base64 } });
      if (error) throw error;
      setVendor({ ...(data?.vendor || {}), address: data?.vendor?.address || '' });
      setPreview(data?.text_preview || '');
      toast({ title: 'Extracted', description: 'Review fields below and save.' });
    } catch (e: any) {
      toast({ title: 'Failed to parse', description: e.message || String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!vendor.firm_name) { toast({ title: 'Firm name required', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      if (makeDefault) {
        await supabase.from('vendor_profiles' as any).update({ is_default: false }).eq('is_default', true);
      }
      const payload: any = { ...vendor, is_default: makeDefault, raw_text: preview || null };
      const { error } = await supabase.from('vendor_profiles' as any).insert(payload);
      if (error) throw error;
      toast({ title: 'Vendor saved' });
      setVendor({}); setPreview('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Import Quotation PDF</h1>
        <p className="text-sm text-muted-foreground mt-1">Extract vendor / firm details from a sample quotation and save as a vendor profile.</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Upload PDF</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          <Button onClick={() => inputRef.current?.click()} disabled={busy} className="gradient-primary text-primary-foreground">
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />} Pick PDF
          </Button>
          {preview && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Show extracted text preview</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-2 max-h-64 overflow-auto">{preview}</pre>
            </details>
          )}
        </CardContent>
      </Card>

      {(Object.keys(vendor).length > 0) && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Review &amp; save</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {fields.map(([k, label]) => (
              <div key={k} className="space-y-1.5">
                <Label>{label}</Label>
                <Input value={vendor?.[k] ?? ''} onChange={(e) => setVendor({ ...vendor, [k]: e.target.value })} />
              </div>
            ))}
            <div className="md:col-span-2 space-y-1.5">
              <Label>Address</Label>
              <Textarea rows={2} value={vendor?.address ?? ''} onChange={(e) => setVendor({ ...vendor, address: e.target.value })} />
            </div>
            <label className="md:col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
              Make this the default vendor used in generated quotations
            </label>
            <div className="md:col-span-2">
              <Button onClick={save} disabled={busy || !vendor.firm_name} className="gradient-primary text-primary-foreground"><Save className="h-4 w-4 mr-1" /> Save vendor</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default QuotationImport;
