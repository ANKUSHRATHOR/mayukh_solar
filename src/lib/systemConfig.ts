import { supabase } from '@/integrations/supabase/client';

/**
 * `system_configs` postdates the last Supabase type generation, so
 * `.from('system_configs')` has no row type and every `.select('value')`
 * resolves to `SelectQueryError`. These helpers contain the cast in one place
 * instead of scattering `as any` across call sites.
 *
 * Drop them once `src/integrations/supabase/types.ts` is regenerated.
 */

/** Reads a single config value, or null if the key is absent or the read fails. */
export const fetchSystemConfig = async <T = unknown>(key: string): Promise<T | null> => {
  const { data, error } = await supabase
    .from('system_configs')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) return null;
  return ((data as { value?: T }).value ?? null) as T | null;
};

/** Upserts a config value. Admin-only at the RLS layer. */
export const saveSystemConfig = async (key: string, value: unknown): Promise<void> => {
  const { error } = await supabase
    .from('system_configs' as any)
    .upsert({ key, value, updated_at: new Date().toISOString() } as any, { onConflict: 'key' });

  if (error) throw error;
};
