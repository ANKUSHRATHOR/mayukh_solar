import { supabase } from '@/integrations/supabase/client';
import type { DocumentType } from '@/lib/documents';
import { compressImage } from '@/lib/capture';
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
 * Outcomes a surveyor can record, phrased as the decision the customer actually
 * made on site rather than an engineering verdict on the roof.
 *
 * `requiresDocuments` is the gate on the paperwork below. Only a customer who
 * has agreed to go ahead needs their Aadhaar and bill collected — asking for
 * them when the customer just declined blocks the surveyor from closing the
 * visit at all, so they either fake an upload or leave the visit open.
 */
export interface VisitOutcome {
  value: string;
  label: string;
  /** Blocks completion until every required document is on file. */
  requiresDocuments: boolean;
  /** Collects a new date and books the follow-on visit. */
  reschedules?: boolean;
}

export const VISIT_OUTCOMES: readonly VisitOutcome[] = [
  { value: 'ready_to_proceed', label: 'Customer ready to move forward', requiresDocuments: true },
  { value: 'not_interested', label: 'Customer does not want to proceed', requiresDocuments: false },
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
  } | null;
}

const VISIT_SELECT = `
  *,
  leads!inner(
    id, customer_name, mobile, alt_mobile, email,
    address, village_city, district, state,
    k_number, kw_interest, status, latitude, longitude
  )
`;

export type VisitTab = 'open' | 'completed';

/**
 * One page of visits for the Visits module.
 *
 * `open` means still to be done — scheduled visits only. Cancelled visits are
 * excluded from both tabs; they are neither outstanding work nor a record of a
 * survey, and showing them in "open" would keep dead work on the list forever.
 */
export const fetchVisitsPage = async (
  params: TableQueryParams
): Promise<TablePage<VisitWithLead>> => {
  const { tab } = params.filters as { tab?: VisitTab };
  const term = params.search.trim().replace(/[,()*]/g, ' ').trim();

  let query = supabase.from('site_visits').select(VISIT_SELECT, { count: 'exact' });

  query =
    tab === 'completed'
      ? query.eq('visit_status', 'completed')
      : query.eq('visit_status', 'scheduled');

  if (term) {
    // PostgREST cannot `or()` across an embedded resource, so the lead match is
    // resolved to ids first.
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
    // No matching lead means no matching visit — force an empty result rather
    // than silently returning every row.
    query = query.in('lead_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']);
  }

  const result = await applyPaging(query, params);
  return toTablePage<VisitWithLead>(result as any);
};

/** Counts for the Open / Completed tabs. */
export const fetchVisitTabCounts = async (): Promise<Record<VisitTab, number>> => {
  const countOf = async (status: string) => {
    const { count } = await supabase
      .from('site_visits')
      .select('id', { count: 'exact', head: true })
      .eq('visit_status', status);
    return count ?? 0;
  };
  const [open, completed] = await Promise.all([countOf('scheduled'), countOf('completed')]);
  return { open, completed };
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

/** Documents already attached to this lead, keyed by type. */
export const fetchLeadDocuments = async (leadId: string) => {
  const { data, error } = await supabase
    .from('documents')
    .select('id, document_type, file_url, uploaded_at')
    .eq('lead_id', leadId);

  if (error) throw new Error(error.message);
  return data ?? [];
};

export interface BookVisitInput {
  leadId: string;
  scheduledFor: string;
  assignedToUserId: string;
  notes?: string;
}

/** Books a visit and moves the lead to `visit_created`. */
export const bookVisit = async (
  input: BookVisitInput,
  createdByUserId: string
): Promise<SiteVisit> => {
  const { data, error } = await supabase
    .from('site_visits')
    .insert({
      lead_id: input.leadId,
      staff_id: createdByUserId,
      assigned_to_user_id: input.assignedToUserId,
      visit_status: 'scheduled',
      scheduled_for: input.scheduledFor,
      visit_date: input.scheduledFor,
      visit_notes: input.notes || null,
    } as any)
    .select()
    .single();

  if (error) throw new Error(error.message);

  const { error: leadError } = await supabase
    .from('leads')
    .update({ status: 'visit_created' as any, follow_up_date: input.scheduledFor })
    .eq('id', input.leadId);
  if (leadError) throw new Error(leadError.message);

  return data as unknown as SiteVisit;
};

/**
 * Uploads a document collected during a visit. Stored under
 * `leads/{lead_id}/...` — the storage policy keys on that prefix.
 */
export const uploadVisitDocument = async (
  leadId: string,
  userId: string,
  documentType: DocumentType,
  file: File
): Promise<void> => {
  const isImage = file.type.startsWith('image/');
  const payload = isImage ? await compressImage(file) : file;
  const extension = isImage ? 'jpg' : (file.name.split('.').pop() || 'pdf').toLowerCase();
  const path = `leads/${leadId}/${documentType}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('project-documents')
    .upload(path, payload, { upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('lead_id', leadId)
    .eq('document_type', documentType)
    .maybeSingle();

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
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  outcome: string;
  notes?: string;
}

/**
 * Completes a visit. The server refuses without coordinates and writes the
 * observed location back onto the lead, overriding the DISCOM-derived one.
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

export const cancelVisit = async (visitId: string, reason: string): Promise<void> => {
  const { error } = await supabase
    .from('site_visits')
    .update({ visit_status: 'cancelled', cancelled_reason: reason } as any)
    .eq('id', visitId);
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
