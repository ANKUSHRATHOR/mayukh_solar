import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { downloadQuotationPdf } from '@/lib/quotationPdf';
import type { LeadQuotation } from '@/lib/leadQuotations';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  quote: LeadQuotation | null;
}

const PREVIEW_AREA_ID = 'lead-quotation-preview-area';

/**
 * Read-only view of a lead quotation as the customer-facing document.
 *
 * Renders the same A4 layout the lead page previews (letterhead, specs,
 * cost/subsidy breakdown, offered price), so a quotation looks identical
 * whether it is opened from the lead record or from a visit.
 */
const QuotationPreviewDialog = ({ open, onOpenChange, leadId, quote }: Props) => {
  // The document needs the customer block and letterhead; fetch them here so
  // any page can host this dialog with nothing but a leadId.
  const contextQuery = useQuery({
    queryKey: ['quotation-preview-context', leadId],
    enabled: open && Boolean(leadId),
    queryFn: async () => {
      const [leadRes, vendorRes] = await Promise.all([
        supabase
          .from('leads')
          .select('customer_name, mobile, address, village_city, district, state, plant_details')
          .eq('id', leadId)
          .maybeSingle(),
        supabase.from('vendor_profiles' as any).select('*').eq('is_default', true).maybeSingle(),
      ]);
      if (leadRes.error) throw new Error(leadRes.error.message);
      return { lead: leadRes.data as any, vendor: vendorRes.data as any };
    },
  });

  const lead = contextQuery.data?.lead;
  const vendor = contextQuery.data?.vendor;
  const plant = (lead?.plant_details as any) ?? null;

  const handleDownload = () => {
    const element = document.getElementById(PREVIEW_AREA_ID);
    if (!element || !quote) return;
    downloadQuotationPdf(element, quote.quotation_number);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] w-[95vw] max-w-4xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 flex-row items-center justify-between border-b border-border/60 px-5 py-3.5">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <FileText className="h-4 w-4 text-primary" />
            Quotation Document — {quote?.quotation_number}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Quotation preview with PDF download.
          </DialogDescription>
          <div className="flex gap-2 pr-8">
            <Button size="sm" onClick={handleDownload} className="h-8 text-xs">
              Download PDF
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-slate-100/50 p-6 font-sans">
          <div
            className="mx-auto flex min-h-[297mm] max-w-2xl flex-col justify-between rounded-xl border border-slate-200 bg-white p-8 text-slate-800 shadow-xl"
            id={PREVIEW_AREA_ID}
          >
            <div className="space-y-6">
              {/* Header (Letterhead) */}
              <div className="flex items-start justify-between border-b-2 border-orange-500 pb-5">
                <div>
                  <h2 className="text-2xl font-extrabold tracking-wide text-orange-600">
                    {vendor?.firm_name || 'MAYUKH SOLAR'}
                  </h2>
                  <p className="text-[11px] font-medium text-slate-500">Solar Energy Solutions</p>
                  {vendor?.address && (
                    <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-slate-500">{vendor.address}</p>
                  )}
                  {vendor?.mobile && (
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      Mob: {vendor.mobile} {vendor.email ? ` | ${vendor.email}` : ''}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold uppercase tracking-widest text-slate-900">QUOTATION</p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-600">No: {quote?.quotation_number}</p>
                  <p className="text-[11px] text-slate-500">
                    Date:{' '}
                    {quote?.created_at
                      ? new Date(quote.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : ''}
                  </p>
                </div>
              </div>

              {/* Customer vs system specs */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
                  <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-orange-600">Quotation For</h4>
                  <p className="text-sm font-bold text-slate-900">{lead?.customer_name}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                    {[lead?.address, lead?.village_city, lead?.district, lead?.state].filter(Boolean).join(', ')}
                  </p>
                  {lead?.mobile && <p className="mt-2 text-xs font-semibold text-slate-900">Mob: {lead.mobile}</p>}
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
                  <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-orange-600">System Specs</h4>
                  <p className="text-sm font-bold text-slate-900">
                    {quote?.capacity_kw || 'N/A'} kW System{(quote as any)?.phase ? ` (${(quote as any).phase})` : ''}
                  </p>
                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    <p>
                      <strong>Panel:</strong> {quote?.panel_brand || 'N/A'} (
                      {quote?.panel_watt ? `${quote.panel_watt}W` : 'N/A'}) x {quote?.panel_qty || 'N/A'}
                    </p>
                    <p>
                      <strong>Inverter:</strong> {quote?.inverter_brand || 'N/A'}
                      {(quote as any)?.inverter_capacity ? ` (${(quote as any).inverter_capacity} kW)` : ''}
                    </p>
                    <p>
                      <strong>Cable:</strong> {plant?.wiremake || 'Polycab'} ({plant?.wire_size || '4 sqmm'}{' '}
                      {plant?.wire_material || 'Copper'})
                    </p>
                    {quote?.structure_type && (
                      <p>
                        <strong>Structure:</strong> {quote.structure_type}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Pricing table */}
              <div className="space-y-2 pt-2">
                <h4 className="border-b pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-900">
                  Cost &amp; Subsidy Breakdown
                </h4>
                <table className="w-full border-collapse border border-slate-200 text-left text-xs">
                  <thead>
                    <tr className="bg-orange-50/80 font-bold text-orange-950">
                      <th className="border border-slate-200 p-2.5">Description</th>
                      <th className="border border-slate-200 p-2.5 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-200 p-2.5">Solar Power Plant Setup (Turnkey Cost)</td>
                      <td className="border border-slate-200 p-2.5 text-right font-medium">
                        {quote?.total_cost ? Number(quote.total_cost).toLocaleString('en-IN') : '0'}
                      </td>
                    </tr>
                    {!!quote?.subsidy_amount && (
                      <tr>
                        <td className="border border-slate-200 p-2.5 font-semibold text-emerald-700">
                          Central Government Subsidy Benefit
                        </td>
                        <td className="border border-slate-200 p-2.5 text-right font-semibold text-emerald-700">
                          - {Number(quote.subsidy_amount).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    )}
                    <tr className="bg-slate-50 font-bold text-slate-900">
                      <td className="border border-slate-200 p-2.5">Net Cost to Customer</td>
                      <td className="border border-slate-200 p-2.5 text-right text-slate-950">
                        ₹{quote?.net_cost ? Number(quote.net_cost).toLocaleString('en-IN') : '0'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Offered price */}
              <div className="mt-4 flex items-center justify-between rounded-xl border border-orange-200/80 bg-orange-50 p-4">
                <div>
                  <p className="text-xs font-bold text-orange-950">Offered Deal Quote Price</p>
                  <p className="text-[10px] text-orange-700/80">Final agreed pricing from visit assessment</p>
                </div>
                <p className="text-2xl font-black text-orange-600">
                  ₹{quote?.quote_price ? Number(quote.quote_price).toLocaleString('en-IN') : '0'}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-12 border-t border-slate-200 pt-5 text-center text-[10px] text-slate-400">
              <p className="font-bold text-slate-600">{vendor?.firm_name || 'MAYUKH SOLAR'}</p>
              <p className="mt-0.5">This is a system-generated quotation based on site assessment specs.</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuotationPreviewDialog;
