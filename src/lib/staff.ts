import { supabase } from '@/integrations/supabase/client';
import { applyPaging, buildSearchFilter, toTablePage } from '@/lib/tableQuery';
import type { TableQueryParams, TablePage } from '@/hooks/useServerTable';
import type { AppRole } from '@/lib/schemas';

export interface StaffMember {
  id: string;
  user_id: string;
  full_name: string;
  mobile: string;
  email: string | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
  /** Resolved separately — `user_roles` is a separate table keyed on user_id. */
  role?: AppRole | null;
}

const SEARCH_COLUMNS = ['full_name', 'mobile', 'email'];

/**
 * One page of staff, with each member's role attached.
 *
 * Roles live in `user_roles`, which PostgREST cannot join here (there is no
 * declared FK from `staff` to `user_roles`), so they are fetched in a second
 * query scoped to the page's user ids — one extra round trip, not one per row.
 */
export const fetchStaffPage = async (
  params: TableQueryParams
): Promise<TablePage<StaffMember>> => {
  let query = supabase.from('staff').select('*', { count: 'exact' });

  const search = buildSearchFilter(params.search, SEARCH_COLUMNS);
  if (search) query = query.or(search);

  const { status } = params.filters as { status?: 'active' | 'inactive' };
  if (status === 'active') query = query.eq('is_active', true);
  if (status === 'inactive') query = query.eq('is_active', false);

  const page = toTablePage<StaffMember>((await applyPaging(query, params)) as any);
  if (page.rows.length === 0) return page;

  const { data: roles } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in(
      'user_id',
      page.rows.map((s) => s.user_id)
    );

  const roleByUser = new Map((roles ?? []).map((r) => [r.user_id, r.role as AppRole]));

  return {
    ...page,
    rows: page.rows.map((s) => ({ ...s, role: roleByUser.get(s.user_id) ?? null })),
  };
};

/** A single staff member with their role, for the detail page. */
export const fetchStaffMember = async (id: string): Promise<StaffMember | null> => {
  const { data, error } = await supabase.from('staff').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const { data: role } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', data.user_id)
    .maybeSingle();

  return { ...(data as StaffMember), role: (role?.role as AppRole) ?? null };
};

/** Lifetime activity counts for a staff member's detail page. */
export interface StaffActivity {
  leadsCreated: number;
  leadsAssigned: number;
  openTasks: number;
}

export const fetchStaffActivity = async (userId: string): Promise<StaffActivity> => {
  const countOf = async (
    table: 'leads' | 'tasks',
    apply: (q: any) => any
  ): Promise<number> => {
    // head:true returns only the count, so no rows cross the wire.
    const { count, error } = await apply(
      supabase.from(table).select('id', { count: 'exact', head: true })
    );
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  const [leadsCreated, leadsAssigned, openTasks] = await Promise.all([
    countOf('leads', (q) => q.eq('created_by_user_id', userId)),
    countOf('leads', (q) => q.eq('assigned_to_user_id', userId)),
    countOf('tasks', (q) => q.eq('assigned_to_user_id', userId).neq('status', 'completed')),
  ]);

  return { leadsCreated, leadsAssigned, openTasks };
};

/** Activates or deactivates a staff member. */
export const setStaffActive = async (staffId: string, isActive: boolean): Promise<void> => {
  const { error } = await supabase
    .from('staff')
    .update({ is_active: isActive })
    .eq('id', staffId);
  if (error) throw new Error(error.message);
};
