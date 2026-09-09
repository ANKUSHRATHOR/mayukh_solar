import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchSystemConfig } from '@/lib/systemConfig';
import type { BomTemplateRow } from '@/lib/quotationDocument';

export interface QuotationContext {
  /** `vendor_profiles` default row, or null when RLS hides it. */
  vendor: Record<string, unknown> | null;
  terms: { title: string; body: string }[];
  bomRows: BomTemplateRow[];
}

/**
 * The parts of a quotation that are the same for every customer: the letterhead,
 * the terms, and the standing bill of material.
 *
 * One hook so the lead preview, the WhatsApp send and the project quotation all
 * build their document from identical inputs — the three lead templates drifted
 * precisely because each fetched its own context.
 *
 * A failure here degrades rather than throws: the template already falls back to
 * the firm name with no vendor row, and an empty terms list simply renders no
 * terms section. A missing letterhead should not stop someone quoting.
 */
export const useQuotationContext = (enabled = true) =>
  useQuery<QuotationContext>({
    queryKey: ['quotation-context'],
    enabled,
    // Vendor details and terms change a few times a year at most.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [vendorRes, termsRes, bomRows] = await Promise.all([
        supabase.from('vendor_profiles' as any).select('*').eq('is_default', true).maybeSingle(),
        supabase
          .from('quotation_terms_templates' as any)
          .select('title, body, section_order')
          .eq('is_active', true)
          .order('section_order'),
        fetchSystemConfig<BomTemplateRow[]>('quotation_bom_rows').catch(() => null),
      ]);

      return {
        // Cast through unknown: vendor_profiles and quotation_terms_templates
        // postdate the last types.ts generation, so PostgREST's inferred type is
        // a SelectQueryError. Same pattern CLAUDE.md documents for new tables.
        vendor: (vendorRes.data as unknown as Record<string, unknown> | null) ?? null,
        terms: ((termsRes.data as unknown as { title: string; body: string }[] | null) ?? []).map(
          (t) => ({ title: t.title, body: t.body })
        ),
        bomRows: Array.isArray(bomRows) ? bomRows : [],
      };
    },
  });
