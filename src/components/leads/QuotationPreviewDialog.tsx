import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Loader2 } from 'lucide-react';
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
import { fromLeadQuotation } from '@/lib/quotationDocument';
import { buildQuotationBody } from '@/lib/quotationTemplate';
import { useQuotationContext } from '@/hooks/useQuotationContext';
import type { LeadQuotation } from '@/lib/leadQuotations';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  quote: LeadQuotation | null;
}

const PREVIEW_AREA_ID = 'lead-quotation-preview-area';

/**
 * The customer-facing quotation document.
 *
 * Preview and PDF are the same bytes by construction: the node shown here is
 * the node handed to html2pdf. This used to be a hand-copied duplicate of two
 * other JSX templates in LeadDetail, which is how the three drifted apart.
 */
const QuotationPreviewDialog = ({ open, onOpenChange, leadId, quote }: Props) => {
  const contextQuery = useQuotationContext(open);

  const leadQuery = useQuery({
    queryKey: ['quotation-preview-lead', leadId],
    enabled: open && Boolean(leadId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select(
          'customer_name, mobile, address, village_city, district, state, k_number, plant_details'
        )
        .eq('id', leadId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const html = useMemo(() => {
    if (!quote || !leadQuery.data || !contextQuery.data) return '';
    return buildQuotationBody(
      fromLeadQuotation({
        quotation: quote,
        lead: leadQuery.data,
        vendor: contextQuery.data.vendor,
        terms: contextQuery.data.terms,
        bomRows: contextQuery.data.bomRows,
      })
    );
  }, [quote, leadQuery.data, contextQuery.data]);

  const handleDownload = () => {
    const element = document.getElementById(PREVIEW_AREA_ID);
    if (!element || !quote) return;
    downloadQuotationPdf(element, quote.quotation_number);
  };

  const loading = leadQuery.isLoading || contextQuery.isLoading;

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
            <Button
              size="sm"
              onClick={handleDownload}
              disabled={!html}
              className="h-8 gap-1.5 text-xs"
            >
              <Download className="h-3.5 w-3.5" /> Download PDF
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-slate-100/50 p-6">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            // The document carries its own stylesheet, so it renders the same
            // here, in the PDF and in a bare print window.
            <div
              id={PREVIEW_AREA_ID}
              className="mx-auto w-fit"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuotationPreviewDialog;
