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
  /** Captured by the lead-side form; absent on older quotations. */
  phase?: string | null;
  inverter_capacity?: number | null;
  updated_at?: string | null;
  created_by?: string | null;
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
 * added elsewhere in the meantime isn't clobbered — same discipline as
 * `saveLeadQuotation` below.
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

/** The draft a form produces, before it is given a number and stamped. */
export type LeadQuotationDraft = Omit<
  LeadQuotation,
  'quotation_number' | 'status' | 'created_at'
> & {
  phase?: string | null;
  inverter_capacity?: number | null;
  updated_at?: string | null;
  created_by?: string | null;
};

/**
 * Creates or updates one quotation on the lead's JSONB array.
 *
 * The list is re-read immediately before the write rather than trusting a copy
 * the page loaded earlier: two people can be looking at the same lead, and the
 * old create path wrote back a stale array, silently dropping any quotation
 * added in between. Numbering happens here for the same reason — it depends on
 * how many quotations exist *now*.
 */
export const saveLeadQuotation = async (
  leadId: string,
  draft: LeadQuotationDraft,
  options: { editingNumber?: string | null; createdBy?: string | null } = {}
): Promise<LeadQuotation> => {
  const { data, error: readError } = await supabase
    .from('leads')
    .select('quotation_details')
    .eq('id', leadId)
    .single();
  if (readError) throw new Error(readError.message);

  const raw = data?.quotation_details;
  const list: LeadQuotation[] = Array.isArray(raw)
    ? (raw as unknown as LeadQuotation[])
    : raw && typeof raw === 'object' && Object.keys(raw).length > 0
      ? [raw as unknown as LeadQuotation]
      : [];

  const now = new Date().toISOString();
  const existingIndex = options.editingNumber
    ? list.findIndex((q) => q.quotation_number === options.editingNumber)
    : -1;
  const existing = existingIndex >= 0 ? list[existingIndex] : null;

  const quotationNumber =
    existing?.quotation_number ??
    `MS-Q-${Math.floor(100000 + Math.random() * 900000)}-${String(list.length + 1).padStart(2, '0')}`;

  const saved: LeadQuotation = {
    ...draft,
    quotation_number: quotationNumber,
    // An edit must not silently reset a quotation the customer already accepted.
    status: existing?.status ?? 'pending',
    created_at: existing?.created_at ?? now,
    created_by: existing?.created_by ?? options.createdBy ?? null,
    updated_at: now,
  } as LeadQuotation;

  const next = existingIndex >= 0
    ? list.map((q, i) => (i === existingIndex ? saved : q))
    : [...list, saved];

  const { data: written, error: writeError } = await supabase
    .from('leads')
    .update({ quotation_details: next as any })
    .eq('id', leadId)
    .select('id');
  if (writeError) throw new Error(writeError.message);
  if (!written || written.length === 0) {
    throw new Error('No rows were updated — row level security refused the write.');
  }

  return saved;
};
