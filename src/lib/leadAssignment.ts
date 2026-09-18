import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/**
 * A lead's two owners.
 *
 * `assigned_telecaller_id` is the telecaller on the phone; `assigned_to_user_id`
 * is the sales rep who visits and closes. They used to be one column, so handing
 * a lead to a sales rep took it off the telecaller — see migration
 * 20260918000300.
 */

export type AssignmentSlot = 'telecaller' | 'sales_person';

export const SLOT_LABEL: Record<AssignmentSlot, string> = {
  telecaller: 'Telecaller',
  sales_person: 'Sales Rep',
};

export interface AssignableStaff {
  user_id: string;
  full_name: string;
  mobile: string | null;
  role: string;
}

/**
 * Who may change a slot. The database decides for real (`assign_lead`); this
 * only keeps controls off screens where they would always fail.
 *
 * Admins and operators move either slot. A telecaller may hand their own lead to
 * a sales rep — they qualify it, so they should not have to queue for an admin —
 * but cannot move the telecaller slot, including their own: losing a lead stays
 * an admin's decision.
 */
export const canAssignSlot = (role: string | null | undefined, slot: AssignmentSlot): boolean => {
  if (role === 'admin' || role === 'operator') return true;
  return slot === 'sales_person' && role === 'telecaller';
};

/** Active telecallers and sales reps, for the assignment pickers. */
export const fetchAssignableStaff = async (): Promise<AssignableStaff[]> => {
  const { data, error } = await (supabase as unknown as SupabaseClient).rpc('get_staff_directory');
  if (error) throw new Error(error.message);
  return ((data ?? []) as AssignableStaff[])
    .filter((s) => s.role === 'telecaller' || s.role === 'sales_person')
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
};

/** Sets or clears one slot. `null` clears it. */
export const assignLead = async (
  leadId: string,
  slot: AssignmentSlot,
  assignee: string | null
): Promise<void> => {
  const { error } = await (supabase as unknown as SupabaseClient).rpc('assign_lead', {
    _lead_id: leadId,
    _slot: slot,
    _assignee: assignee,
  });
  if (error) throw new Error(error.message);
};
