import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SubsidySlab {
  /** Upper bound of the slab in kW, inclusive. `null` means "and above". */
  max_kw: number | null;
  amount: number;
}

/**
 * PM Surya Ghar: Muft Bijli Yojana, central financial assistance for residential
 * rooftop solar. Slab-based by sanctioned capacity — NOT a flat amount.
 *
 * Used as a fallback when the `pm_surya_ghar_subsidy` row in `system_configs`
 * is unavailable, so the UI never renders ₹0 on a failed fetch. Admins can
 * override the slabs there when the scheme changes.
 */
export const SUBSIDY_SLABS_FALLBACK: SubsidySlab[] = [
  { max_kw: 1, amount: 30000 },
  { max_kw: 2, amount: 60000 },
  { max_kw: null, amount: 78000 },
];

/**
 * Returns the central subsidy for a given sanctioned capacity.
 *
 * Capacity below 1 kW earns nothing. Slabs are matched on the first upper bound
 * the capacity falls within, so order matters — callers passing custom slabs
 * must supply them ascending.
 */
export const calculateSubsidy = (
  capacityKw: number | string | null | undefined,
  slabs: SubsidySlab[] = SUBSIDY_SLABS_FALLBACK
): number => {
  const kw = Number(capacityKw);
  if (!Number.isFinite(kw) || kw < 1) return 0;

  for (const slab of slabs) {
    if (slab.max_kw === null || kw <= slab.max_kw) return slab.amount;
  }
  return slabs[slabs.length - 1]?.amount ?? 0;
};

/** Formats a subsidy figure for display, e.g. `₹60,000`. */
export const formatSubsidy = (amount: number): string =>
  `₹${Number(amount || 0).toLocaleString('en-IN')}`;

const isSlabArray = (value: unknown): value is SubsidySlab[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (s) =>
      s !== null &&
      typeof s === 'object' &&
      typeof (s as SubsidySlab).amount === 'number' &&
      ((s as SubsidySlab).max_kw === null || typeof (s as SubsidySlab).max_kw === 'number')
  );

/**
 * Reads the subsidy slabs from `system_configs`, falling back to the hardcoded
 * table. Cached for the session — the scheme does not change mid-shift.
 */
export const useSubsidySlabs = (): SubsidySlab[] => {
  const { data } = useQuery({
    queryKey: ['subsidy-slabs'],
    staleTime: Infinity,
    queryFn: async (): Promise<SubsidySlab[]> => {
      const { data, error } = await supabase
        .from('system_configs')
        .select('value')
        .eq('key', 'pm_surya_ghar_subsidy')
        .maybeSingle();

      if (error || !data) return SUBSIDY_SLABS_FALLBACK;
      const slabs = (data as any).value?.slabs;
      return isSlabArray(slabs) ? slabs : SUBSIDY_SLABS_FALLBACK;
    },
  });

  return data ?? SUBSIDY_SLABS_FALLBACK;
};
