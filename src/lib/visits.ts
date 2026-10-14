import { supabase } from '@/integrations/supabase/client';
import { documentLabels, type DocumentType } from '@/lib/documents';
import { uploadFile } from '@/lib/fileStore';
import { applyPaging, toTablePage } from '@/lib/tableQuery';
import type { TableQueryParams, TablePage } from '@/hooks/useServerTable';

/**
 * Site visits.
 *
 * A visit has a real lifecycle: booked → completed (or cancelled). Rows marked
 * `note` are call logs and free-text entries that were historically stored in
 * this same table; they are not visits and never appear in the visit list.
 */

export type VisitStatus = 'scheduled' | 'completed' | 'cancelled' | 'note';

export interface SiteVisit {
  id: string;
  lead_id: string;
  staff_id: string;
  assigned_to_user_id: string | null;
  visit_status: VisitStatus;
  visit_date: string;
  scheduled_for: string | null;
  completed_at: string | null;
  visit_notes: string | null;
  outcome: string | null;
  cancelled_reason: string | null;
  latitude: number | null;
  longitude: number | null;
  location_accuracy_m: number | null;
  status_updated_to: string | null;
}

/**
 * Outcomes a surveyor or telecaller can record, phrased as the decision the
 * customer actually made rather than an engineering verdict on the roof.
 *
 * `requiresDocuments` is the gate on the paperwork below. Only a customer who
 * has agreed to go ahead needs their Aadhaar and bill collected — asking for
 * them when the customer just declined blocks the caller from closing the
 * update at all, so they either fake an upload or leave it open.
 *
 * `skipsLocation` covers the outcomes that never involve anyone going on
 * site — a call that didn't connect, or a customer who says no over the
 * phone. Forcing a GPS fix (and the browser permission prompt that comes
 * with it) for a status update that happened over the phone makes no sense,
 * so `complete_site_visit` only enforces the location requirement when this
 * is unset or false.
 */
export interface VisitOutcome {
  value: string;
  label: string;
  /** Blocks completion until every required document is on file. */
  requiresDocuments: boolean;
  /** Collects a new date and books the follow-on visit. */
  reschedules?: boolean;
  /** No GPS fix required — nothing happened on site for this outcome. */
  skipsLocation?: boolean;
}

export const VISIT_OUTCOMES: readonly VisitOutcome[] = [
  { value: 'ready_to_proceed', label: 'Customer ready to move forward', requiresDocuments: true },
  { value: 'not_interested', label: 'Not interested', requiresDocuments: false, skipsLocation: true },
  {
    value: 'call_not_connected',
    label: 'Call not connected',
    requiresDocuments: false,
    skipsLocation: true,
  },
  { value: 'follow_up_needed', label: 'Needs another follow-up', requiresDocuments: false },
  { value: 'revisit_required', label: 'Another site visit needed', requiresDocuments: false },
  { value: 'reschedule', label: 'Change the visit date', requiresDocuments: false, reschedules: true },
] as const;

/**
 * Labels for outcomes recorded before the list above replaced the old
 * feasibility wording. Completed visits keep whatever value they were saved
 * with, so without these the history renders raw enum strings.
 */
const LEGACY_OUTCOME_LABELS: Record<string, string> = {
  feasible: 'Site feasible — proceed to quotation',
  feasible_with_changes: 'Feasible with changes',
  not_feasible: 'Not feasible',
  customer_unavailable: 'Customer unavailable',
};

/** Display label for any outcome, current or historical. */
export const outcomeLabel = (value: string | null | undefined): string =>
  VISIT_OUTCOMES.find((o) => o.value === value)?.label ??
  (value ? LEGACY_OUTCOME_LABELS[value] ?? value : '—');

export const findOutcome = (value: string | null | undefined): VisitOutcome | undefined =>
  VISIT_OUTCOMES.find((o) => o.value === value);

/** Whether this outcome makes the required documents mandatory. */
export const outcomeRequiresDocuments = (value: string | null | undefined): boolean =>
  findOutcome(value)?.requiresDocuments ?? false;

/** Lead status each outcome moves the lead to. */
export const OUTCOME_TO_LEAD_STATUS: Record<string, string> = {
  ready_to_proceed: 'interested',
  not_interested: 'not_interested',
  call_not_connected: 'not_connected',
  follow_up_needed: 'follow_up',
  revisit_required: 'follow_up',
  // A rescheduled visit is still an outstanding visit, so the lead stays where
  // booking put it rather than falling back to a generic follow-up.
  reschedule: 'visit_created',
};

/**
 * Documents a surveyor is expected to collect on site. These attach to the
 * lead, not a project — the project does not exist yet at this stage.
 *
 * `required` is conditional: it applies only when the outcome
 * `requiresDocuments`. See VISIT_OUTCOMES.
 */
export const VISIT_DOCUMENTS: { type: DocumentType; label: string; required: boolean }[] = [
  { type: 'electricity_bill', label: 'Electricity Bill', required: true },
  { type: 'aadhaar_front', label: 'Aadhaar (Front)', required: true },
  { type: 'aadhaar_back', label: 'Aadhaar (Back)', required: true },
  { type: 'overall_structure', label: 'Rooftop / Site Photo', required: true },
  { type: 'passport_photo', label: 'Customer Photo', required: false },
  { type: 'property_papers', label: 'Property Papers', required: false },
];

/** A visit joined with the customer details the surveyor needs on site. */
export interface VisitWithLead extends SiteVisit {
  leads: {
    id: string;
    customer_name: string;
    mobile: string;
    alt_mobile: string | null;
    email: string | null;
    address: string | null;
    village_city: string | null;
    district: string | null;
    state: string | null;
    k_number: string | null;
    kw_interest: number | null;
    status: string;
    latitude: number | null;
    longitude: number | null;
    /** The lead's two owners: the telecaller on the phone, the rep who closes. */
    assigned_telecaller_id: string | null;
    assigned_to_user_id: string | null;
  } | null;
}

const VISIT_SELECT = `
  *,
  leads!inner(
    id, customer_name, mobile, alt_mobile, email,
    address, village_city, district, state,
    k_number, kw_interest, status, latitude, longitude,
    assigned_telecaller_id, assigned_to_user_id
  )
`;

export type VisitTab = 'open' | 'completed' | 'cancelled';

/**
 * Roles that book, edit and cancel visits. The server (`can_manage_site_visit`)
 * is the real gate and also narrows by lead ownership; this only decides
 * whether to offer the controls.
 */
export const VISIT_MANAGER_ROLES = ['admin', 'telecaller', 'sales_person', 'operator'] as const;

export const canManageVisits = (role: string | null | undefined): boolean =>
  (VISIT_MANAGER_ROLES as readonly string[]).includes(role ?? '');

/** Permanent deletion is admin-only; everyone else cancels. */
export const canDeleteVisits = (role: string | null | undefined): boolean => role === 'admin';

/**
 * One page of visits for the Visits module.
 *
 * `open` means still to be done — scheduled visits only. Cancelled visits have
 * their own subset: they are neither outstanding work nor a record of a survey,
 * and showing them in "open" would keep dead work on the list forever.
 */
export const fetchVisitsPage = async (
  params: TableQueryParams
): Promise<TablePage<VisitWithLead>> => {
  const { tab, assignee = 'all', when = 'all' } = params.filters as {
    tab?: VisitTab;
    /** A user id, `unassigned`, or `all`. */
    assignee?: string;
    when?: ScheduledWindow;
  };
  const term = params.search.trim().replace(/[,()*]/g, ' ').trim();

  let query = supabase.from('site_visits').select(VISIT_SELECT, { count: 'exact' });

  query = query.eq(
    'visit_status',
    tab === 'completed' ? 'completed' : tab === 'cancelled' ? 'cancelled' : 'scheduled'
  );

  if (assignee === 'unassigned') query = query.is('assigned_to_user_id', null);
  else if (assignee !== 'all') query = query.eq('assigned_to_user_id', assignee);

  const { from, before } = windowBounds(when);
  if (from) query = query.gte('scheduled_for', from);
  if (before) query = query.lt('scheduled_for', before);

  if (term) query = query.in('lead_id', await leadIdsMatching(term));

  const result = await applyPaging(query, params);
  return toTablePage<VisitWithLead>(result as any);
};

/**
 * Lead ids matching a search term on K-Number, name or mobile. PostgREST cannot
 * `or()` across an embedded resource, so a visit search resolves leads first.
 * No match yields a sentinel id, forcing an empty result rather than silently
 * returning every row.
 */
const leadIdsMatching = async (term: string): Promise<string[]> => {
  const { data: matches } = await supabase
    .from('leads')
    .select('id')
    .or(
      [
        `customer_name.ilike.%${term}%`,
        `mobile.ilike.%${term}%`,
        `k_number.ilike.%${term}%`,
      ].join(',')
    )
    .limit(500);

  const ids = (matches ?? []).map((l) => l.id);
  return ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000'];
};

/**
 * Subsets of one person's visits, for the sales rep's dashboard.
 *
 * - `today` — still scheduled, booked for today.
 * - `due`   — still scheduled, booked for a day that has already passed.
 * - `all`   — every visit assigned to them, whatever its state.
 *
 * `today` and `due` never overlap: a visit booked for 10am that is still open at
 * 3pm is today's work, and only becomes due tomorrow.
 */
export type MyVisitScope = 'today' | 'due' | 'all';

/** Local midnight today and tomorrow, as ISO strings. */
const todayBounds = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
};

/**
 * A filter on when a visit is booked for. Calendar periods in local time: the
 * week starts on Monday, and `past` is anything before today.
 */
export type ScheduledWindow = 'all' | 'past' | 'today' | 'week' | 'month';

export const SCHEDULED_WINDOWS: { value: Exclude<ScheduledWindow, 'all'>; label: string }[] = [
  { value: 'past', label: 'Before today' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];

const windowBounds = (when: ScheduledWindow): { from?: string; before?: string } => {
  if (when === 'all') return {};
  const { start, end } = todayBounds();
  if (when === 'past') return { before: start };
  if (when === 'today') return { from: start, before: end };
  const now = new Date();
  if (when === 'week') {
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const next = new Date(monday);
    next.setDate(next.getDate() + 7);
    return { from: monday.toISOString(), before: next.toISOString() };
  }
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    before: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
  };
};

/** The statuses and scheduled window a scope covers; open-ended where unset. */
const scopeRange = (scope: MyVisitScope) => {
  if (scope === 'all') return { statuses: ['scheduled', 'completed', 'cancelled'] };
  const { start, end } = todayBounds();
  return scope === 'today'
    ? { statuses: ['scheduled'], from: start, before: end }
    : { statuses: ['scheduled'], before: start };
};

/**
 * One page of the visits assigned to `filters.assignee`, narrowed by
 * `filters.scope`, then by the optional `status` and `when` refinements. Both
 * stack on the scope as further conditions, so they can only narrow it.
 */
export const fetchMyVisitsPage = async (
  params: TableQueryParams
): Promise<TablePage<VisitWithLead>> => {
  const { assignee, scope, status = 'all', when = 'all' } = params.filters as {
    assignee: string;
    scope: MyVisitScope;
    status?: 'all' | 'scheduled' | 'completed' | 'cancelled';
    when?: ScheduledWindow;
  };
  const term = params.search.trim().replace(/[,()*]/g, ' ').trim();

  const { statuses, from, before } = scopeRange(scope);
  let query = supabase
    .from('site_visits')
    .select(VISIT_SELECT, { count: 'exact' })
    .eq('assigned_to_user_id', assignee)
    .in('visit_status', statuses);
  if (from) query = query.gte('scheduled_for', from);
  if (before) query = query.lt('scheduled_for', before);
  if (status !== 'all') query = query.eq('visit_status', status);
  const window = windowBounds(when);
  if (window.from) query = query.gte('scheduled_for', window.from);
  if (window.before) query = query.lt('scheduled_for', window.before);
  if (term) query = query.in('lead_id', await leadIdsMatching(term));

  const result = await applyPaging(query, params);
  return toTablePage(result as unknown as Parameters<typeof toTablePage<VisitWithLead>>[0]);
};

/** Counts behind the sales rep's three visit tiles. */
export const fetchMyVisitCounts = async (assignee: string): Promise<Record<MyVisitScope, number>> => {
  const countOf = async (scope: MyVisitScope) => {
    const { statuses, from, before } = scopeRange(scope);
    let query = supabase
      .from('site_visits')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to_user_id', assignee)
      .in('visit_status', statuses);
    if (from) query = query.gte('scheduled_for', from);
    if (before) query = query.lt('scheduled_for', before);
    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return count ?? 0;
  };
  const [today, due, all] = await Promise.all([countOf('today'), countOf('due'), countOf('all')]);
  return { today, due, all };
};

/** Counts for the Open / Completed / Cancelled subsets. */
export const fetchVisitTabCounts = async (): Promise<Record<VisitTab, number>> => {
  const countOf = async (status: string) => {
    const { count } = await supabase
      .from('site_visits')
      .select('id', { count: 'exact', head: true })
      .eq('visit_status', status);
    return count ?? 0;
  };
  const [open, completed, cancelled] = await Promise.all([
    countOf('scheduled'),
    countOf('completed'),
    countOf('cancelled'),
  ]);
  return { open, completed, cancelled };
};

export const fetchVisit = async (visitId: string): Promise<VisitWithLead | null> => {
  const { data, error } = await supabase
    .from('site_visits')
    .select(VISIT_SELECT)
    .eq('id', visitId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as unknown as VisitWithLead | null) ?? null;
};

export const fetchVisits = async (leadId: string): Promise<SiteVisit[]> => {
  const { data, error } = await supabase
    .from('site_visits')
    .select('*')
    .eq('lead_id', leadId)
    .in('visit_status', ['scheduled', 'completed', 'cancelled'])
    .order('scheduled_for', { ascending: false, nullsFirst: false })
    .order('visit_date', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SiteVisit[];
};

/**
 * The visit functions postdate the generated types. One untyped entry point
 * instead of an `as any` per call.
 */
type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
const visitRpc: UntypedRpc = (fn, args) =>
  (supabase.rpc as unknown as UntypedRpc).call(supabase, fn, args);

export interface BookVisitInput {
  leadId: string;
  scheduledFor: string;
  /** Null leaves the visit open for anyone to claim. */
  assignedToUserId: string | null;
  notes?: string;
}

/**
 * Books a visit through `book_site_visit`, which also moves the lead to
 * `visit_created`, points its follow-up date at the next scheduled visit, and
 * fills the lead's assignee only if it has none. The creator is always the
 * caller, so there is no user id to pass.
 */
export const bookVisit = async (input: BookVisitInput): Promise<SiteVisit> => {
  const { data, error } = await visitRpc('book_site_visit', {
    _lead_id: input.leadId,
    _scheduled_for: input.scheduledFor,
    _assigned_to: input.assignedToUserId,
    _notes: input.notes ?? null,
  });
  if (error) throw new Error(error.message);
  return data as unknown as SiteVisit;
};

export interface UpdateVisitInput {
  visitId: string;
  scheduledFor: string;
  assignedToUserId: string | null;
  notes?: string;
}

/** Edits a scheduled visit. Every field is written, so send the whole form. */
export const updateVisit = async (input: UpdateVisitInput): Promise<SiteVisit> => {
  const { data, error } = await visitRpc('update_site_visit', {
    _visit_id: input.visitId,
    _scheduled_for: input.scheduledFor,
    _assigned_to: input.assignedToUserId,
    _notes: input.notes ?? null,
  });
  if (error) throw new Error(error.message);
  return data as unknown as SiteVisit;
};

/**
 * Uploads a document collected during a visit, into the lead's Google Drive
 * folder.
 *
 * The row is still written here under the caller's RLS, exactly as it was when
 * this uploaded to Supabase Storage — the edge function only creates the Drive
 * file and hands back a `gdrive:` ref.
 */
export const uploadVisitDocument = async (
  leadId: string,
  userId: string,
  documentType: DocumentType,
  file: File
): Promise<void> => {
  // Compression lives in `uploadFile` now, so every upload path gets it.
  const isImage = file.type.startsWith('image/');
  const extension = isImage ? 'jpg' : (file.name.split('.').pop() || 'pdf').toLowerCase();

  const { data: existing } = await supabase
    .from('documents')
    .select('id, file_url')
    .eq('lead_id', leadId)
    .eq('document_type', documentType)
    .maybeSingle();

  // Re-uploading over a rejected document replaces the file in Drive; the old
  // one is trashed only once the new one is stored.
  const path = await uploadFile({
    scope: 'lead',
    ownerId: leadId,
    file,
    filename: `${documentType}.${extension}`,
    label: documentLabels[documentType],
    replaceRef: existing?.file_url ?? null,
  });

  if (existing) {
    const { error } = await supabase
      .from('documents')
      .update({ file_url: path, uploaded_at: new Date().toISOString(), rejection_reason: null })
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('documents').insert({
      lead_id: leadId,
      document_type: documentType,
      file_url: path,
      uploaded_by_user_id: userId,
      is_verified: false,
    });
    if (error) throw new Error(error.message);
  }
};

export interface CompleteVisitInput {
  visitId: string;
  /** Null for outcomes that skip location (see `VisitOutcome.skipsLocation`). */
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  outcome: string;
  notes?: string;
}

/**
 * Completes a visit. The server refuses without coordinates unless the
 * outcome is one that skips location, and otherwise writes the observed
 * location back onto the lead, overriding the DISCOM-derived one.
 */
export const completeVisit = async (input: CompleteVisitInput): Promise<void> => {
  const { error } = await supabase.rpc('complete_site_visit', {
    _visit_id: input.visitId,
    _latitude: input.latitude,
    _longitude: input.longitude,
    _accuracy_m: input.accuracyM,
    _outcome: input.outcome,
    _lead_status: OUTCOME_TO_LEAD_STATUS[input.outcome] ?? 'follow_up',
    _notes: input.notes ?? null,
  });
  if (error) throw new Error(error.message);
};

/**
 * Cancels a scheduled visit. The row stays, marked cancelled with the reason,
 * so the lead's history still shows it was booked.
 */
export const cancelVisit = async (visitId: string, reason: string): Promise<void> => {
  const { error } = await visitRpc('cancel_site_visit', {
    _visit_id: visitId,
    _reason: reason,
  });
  if (error) throw new Error(error.message);
};

/** Permanently deletes a visit. Admin only; the row is kept in audit_logs. */
export const deleteVisit = async (visitId: string): Promise<void> => {
  const { error } = await visitRpc('delete_site_visit', { _visit_id: visitId });
  if (error) throw new Error(error.message);
};

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

/**
 * Captures the device's position.
 *
 * Tries a high-accuracy fix first, then falls back to a coarse one. The
 * fallback matters: high accuracy commonly times out indoors or on a rural
 * rooftop with poor signal, and without it the surveyor simply cannot complete
 * the visit.
 */
export const captureLocation = (): Promise<Coordinates> =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This device cannot report its location.'));
      return;
    }

    const onSuccess = (position: GeolocationPosition) =>
      resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null,
      });

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      () => {
        navigator.geolocation.getCurrentPosition(
          onSuccess,
          (err) =>
            reject(
              new Error(
                err.code === err.PERMISSION_DENIED
                  ? 'Location permission is blocked. Enable it for this site and try again.'
                  : 'Could not get a location fix. Move outside or nearer a window and retry.'
              )
            ),
          { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
