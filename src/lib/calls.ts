import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/**
 * Phone calls on a lead.
 *
 * Calls used to be `site_visits` rows with a "[Call Log]" prefix on the notes,
 * which made every logged call look like a completed site survey and left no
 * way to ask how many calls connected. They now have their own table; see
 * migration 20260918000100.
 *
 * One row is one attempt: pressing the call button writes it as `dialed`, and
 * logging the call afterwards resolves that same row.
 */

export type CallOutcome = 'dialed' | 'connected' | 'not_connected';

export interface CallLog {
  id: string;
  lead_id: string;
  staff_id: string;
  outcome: CallOutcome;
  notes: string | null;
  status_updated_to: string | null;
  follow_up_date: string | null;
  created_at: string;
  logged_at: string | null;
}

export const CALL_OUTCOMES: { value: Exclude<CallOutcome, 'dialed'>; label: string }[] = [
  { value: 'connected', label: 'Connected — customer answered' },
  { value: 'not_connected', label: 'Not connected — no answer / switched off' },
];

export const callOutcomeLabel = (outcome: string | null | undefined): string =>
  outcome === 'connected'
    ? 'Connected'
    : outcome === 'not_connected'
      ? 'Not connected'
      : 'Dialled';

/** The functions postdate the generated types, hence one untyped entry point. */
type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
const callRpc: UntypedRpc = (fn, args) =>
  (supabase.rpc as unknown as UntypedRpc).call(supabase, fn, args);

/**
 * Records that the call button was pressed.
 *
 * Deliberately swallows its errors: this rides along with `tel:`, and a failed
 * count must never stop the phone from dialling or put an error in front of
 * someone mid-call.
 */
export const recordDialAttempt = async (leadId: string): Promise<void> => {
  try {
    await callRpc('record_dial_attempt', { _lead_id: leadId });
  } catch {
    /* counting is best-effort */
  }
};

export interface LogCallInput {
  leadId: string;
  outcome: Exclude<CallOutcome, 'dialed'>;
  notes?: string;
  /** Lead status this call moves the lead to; omitted leaves it alone. */
  status?: string | null;
  /** Required by the caller when the status is `follow_up`. */
  followUpDate?: string | null;
}

export const logCall = async (input: LogCallInput): Promise<CallLog> => {
  const { data, error } = await callRpc('log_call', {
    _lead_id: input.leadId,
    _outcome: input.outcome,
    _notes: input.notes ?? null,
    _status: input.status || null,
    _follow_up_date: input.followUpDate || null,
  });
  if (error) throw new Error(error.message);
  return data as CallLog;
};

/** Every call on a lead, newest first. Unresolved dials are included. */
export const fetchLeadCalls = async (leadId: string): Promise<CallLog[]> => {
  // `call_logs` postdates the generated types, so this reads through a client
  // without them rather than casting each call site.
  const { data, error } = await (supabase as unknown as SupabaseClient)
    .from('call_logs')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as CallLog[];
};

/** Today's figures for a telecaller, plus the month to compare against. */
export interface TelecallerDayStats {
  dialed: number;
  connected: number;
  not_connected: number;
  /** Dialled but never written up. */
  unlogged: number;
  interested: number;
  follow_up: number;
  not_interested: number;
  visits_created: number;
  leads_created: number;
  follow_ups_due_today: number;
  follow_ups_overdue: number;
  month_calls: number;
  month_visits_created: number;
  month_leads_created: number;
}

export const fetchTelecallerDayStats = async (staffId?: string): Promise<TelecallerDayStats> => {
  const { data, error } = await callRpc('telecaller_day_stats', { _staff: staffId ?? null });
  if (error) throw new Error(error.message);
  return data as TelecallerDayStats;
};
