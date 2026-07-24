import { supabase } from '@/integrations/supabase/client';

/**
 * Quotations held against a lead.
 *
 * Lead-stage quotations live in the `leads.quotation_details` JSONB array —
 * the `quotations` table requires a project, which does not exist yet at this
 * point in the funnel.
 */

export interface LeadQuotation {
  quotation_number: string;
  name?: string | null;
  capacity_kw?: number | null;
  panel_brand?: string | null;
  panel_watt?: number | null;
  panel_qty?: number | null;
  inverter_brand?: string | null;
  structure_type?: string | null;
  total_cost?: number | null;
  subsidy_amount?: number | null;
  net_cost?: number | null;
  quote_price?: number | null;
  status?: string | null;
  created_at?: string | null;
}

export const quotationStatusLabels: Record<string, string> = {
  pending: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

/**
 * Reads a lead's quotations, newest first.
 *
 * Tolerates both shapes: the column default was `'{}'` for a long time, so
 * older leads hold a single object rather than an array.
 */
export const fetchLeadQuotations = async (leadId: string): Promise<LeadQuotation[]> => {
  const { data, error } = await supabase
    .from('leads')
    .select('quotation_details')
    .eq('id', leadId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const raw = data?.quotation_details;
  const list: LeadQuotation[] = Array.isArray(raw)
    ? (raw as unknown as LeadQuotation[])
    : raw && typeof raw === 'object' && Object.keys(raw).length > 0
      ? [raw as unknown as LeadQuotation]
      : [];

  return [...list].sort(
    (a, b) =>
      new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  );
};

/** What the customer actually pays, preferring the explicitly quoted price. */
export const quotedPrice = (q: LeadQuotation): number =>
  Number(q.quote_price ?? q.net_cost ?? 0);

/**
 * Removes one quotation from the lead's JSONB array by its number.
 *
 * Read-modify-write, re-reading immediately before the write so a quotation
 * added elsewhere in the meantime isn't clobbered — same discipline as the
 * create path in CreateQuotationDialog.
 */
export const deleteLeadQuotation = async (
  leadId: string,
  quotationNumber: string
): Promise<void> => {
  const { data, error: readError } = await supabase
    .from('leads')
    .select('quotation_details')
    .eq('id', leadId)
    .single();
  if (readError) throw new Error(readError.message);

  const raw = data?.quotation_details;
  const list: LeadQuotation[] = Array.isArray(raw)
    ? (raw as unknown as LeadQuotation[])
    : raw && typeof raw === 'object'
      ? [raw as unknown as LeadQuotation]
      : [];

  const next = list.filter((q) => q.quotation_number !== quotationNumber);
  if (next.length === list.length) return; // already gone — nothing to write

  const { error: writeError } = await supabase
    .from('leads')
    .update({ quotation_details: next as any })
    .eq('id', leadId);
  if (writeError) throw new Error(writeError.message);
};
