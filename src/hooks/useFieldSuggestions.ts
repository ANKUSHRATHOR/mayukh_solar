import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FilterField } from '@/lib/filterConditions';

/**
 * Fills in `suggestions` on every field that names a `suggest` key, from the
 * `filter_value_options` RPC. Values change slowly, so they are cached for a
 * few minutes; a failed load leaves the field as a plain text box.
 */
export function useFieldSuggestions<Row>(fields: FilterField<Row>[]): FilterField<Row>[] {
  const keys = useMemo(
    () => [...new Set(fields.map((f) => f.suggest).filter((k): k is string => !!k))].sort(),
    [fields],
  );

  const { data } = useQuery({
    queryKey: ['filter-value-options', keys],
    enabled: keys.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const entries = await Promise.all(
        keys.map(async (key) => {
          const { data, error } = await supabase.rpc('filter_value_options' as any, { p_key: key });
          return [key, error ? [] : ((data as string[] | null) ?? [])] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, string[]>;
    },
  });

  return useMemo(
    () => (data ? fields.map((f) => (f.suggest && data[f.suggest]?.length ? { ...f, suggestions: data[f.suggest] } : f)) : fields),
    [data, fields],
  );
}
