import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export interface DirectoryEntry {
  user_id: string;
  full_name: string;
  mobile: string | null;
  role: string;
}

/**
 * Active staff, keyed by user id, for turning an assignment into a name.
 *
 * `get_staff_directory` is the SECURITY DEFINER view of staff + roles: reading
 * `staff` directly is admin-only under RLS, so a sales rep doing it gets one row
 * back and every name renders as "Unknown". Shared across pages through
 * react-query, so the directory is fetched once per session rather than per view.
 */
export const useStaffNames = () => {
  const query = useQuery({
    queryKey: ['staff-directory'],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as SupabaseClient).rpc('get_staff_directory');
      if (error) throw new Error(error.message);
      const map = new Map<string, DirectoryEntry>();
      ((data ?? []) as DirectoryEntry[]).forEach((s) => map.set(s.user_id, s));
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  const staff = query.data;
  return {
    staff,
    isLoading: query.isLoading,
    /** The person's name, or null when there is nobody (or nobody we can see). */
    nameOf: (userId: string | null | undefined) =>
      userId ? staff?.get(userId)?.full_name ?? 'Unknown staff' : null,
    entryOf: (userId: string | null | undefined) => (userId ? staff?.get(userId) ?? null : null),
  };
};
