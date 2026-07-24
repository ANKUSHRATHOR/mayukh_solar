import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/capture';
import type { DocumentType } from '@/lib/documents';

/**
 * Trade work completion for welders and electricians.
 *
 * The rule is that work cannot be marked done without photo evidence of the
 * plant. That is enforced server-side by `mark_trade_work_done`, which refuses
 * unless the required document already exists — so a hand-crafted API call
 * can't skip it either.
 */

export type Trade = 'welder' | 'electrician';

export const TRADE_PHOTO: Record<Trade, { documentType: DocumentType; label: string }> = {
  welder: { documentType: 'overall_structure', label: 'Structure photo' },
  electrician: { documentType: 'wiring_connection', label: 'Wiring photo' },
};

/**
 * Uploads a photo and records it against the project.
 *
 * The storage path must start with the project id — storage RLS matches
 * `foldername[1]` against it. `upsert` lets a worker replace a bad photo.
 */
export const uploadWorkPhoto = async (
  projectId: string,
  userId: string,
  documentType: DocumentType,
  file: File
): Promise<string> => {
  const compressed = await compressImage(file);
  const path = `${projectId}/${documentType}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('project-documents')
    .upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });
  if (uploadError) throw new Error(uploadError.message);

  // One document row per type per project: update in place if it exists, so a
  // re-upload after rejection doesn't accumulate duplicates.
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('project_id', projectId)
    .eq('document_type', documentType)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('documents')
      .update({
        file_url: path,
        uploaded_at: new Date().toISOString(),
        rejection_reason: null,
        is_verified: false,
      })
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('documents').insert({
      project_id: projectId,
      document_type: documentType,
      file_url: path,
      uploaded_by_user_id: userId,
      is_verified: false,
    });
    if (error) throw new Error(error.message);
  }

  return path;
};

/**
 * Records serial numbers. Upserts on project_id so a retry after a partial
 * failure updates the existing row rather than inserting a duplicate — the
 * previous two-step flow left orphaned serials whenever the second call failed.
 */
export const saveSerialNumbers = async (
  projectId: string,
  userId: string,
  panelSerial: string,
  inverterSerial: string
): Promise<void> => {
  const { error } = await supabase.from('serial_numbers').upsert(
    {
      project_id: projectId,
      panel_serial: panelSerial.trim(),
      inverter_serial: inverterSerial.trim(),
      entered_by_user_id: userId,
    },
    { onConflict: 'project_id' }
  );
  if (error) throw new Error(error.message);
};

/**
 * Marks a trade's work complete. Fails if the photo is missing — the server
 * checks, so this cannot succeed on a project without evidence.
 */
export const markTradeWorkDone = async (projectId: string, trade: Trade): Promise<void> => {
  const { error } = await supabase.rpc('mark_trade_work_done', {
    _project_id: projectId,
    _trade: trade,
  });
  if (error) throw new Error(error.message);
};

export interface TradeJob {
  id: string;
  capacity_kw: number;
  panel_brand: string;
  panel_qty: number;
  panel_watt: number;
  inverter_brand: string;
  inverter_capacity: number;
  structure_type: string;
  status: string;
  k_number: string | null;
  consumer_name: string | null;
  special_notes: string | null;
  updated_at: string;
  lead_id: string;
  welder_work_done_at: string | null;
  electrician_work_done_at: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
  leads?: {
    customer_name: string;
    mobile: string;
    address: string | null;
    village_city: string | null;
    district: string | null;
    k_number: string | null;
  } | null;
  /** Whether the proof photo for this trade is already on file. */
  hasPhoto?: boolean;
}

/**
 * Jobs for a trade, scoped to the signed-in worker.
 *
 * Filters on the assignment column rather than relying on RLS alone, so the
 * page can honestly say "your jobs". Also resolves photo presence in one query
 * instead of an RPC per project — the old dashboard fired one round trip per
 * row, which is punishing on a 2G connection.
 */
export const fetchTradeJobs = async (
  trade: Trade,
  userId: string
): Promise<TradeJob[]> => {
  const assignmentColumn =
    trade === 'welder' ? 'assigned_welder_id' : 'assigned_electrician_id';

  const { data, error } = await supabase
    .from('projects')
    .select(
      `
      id, capacity_kw, panel_brand, panel_qty, panel_watt,
      inverter_brand, inverter_capacity, structure_type, status,
      k_number, consumer_name, special_notes, updated_at, lead_id,
      welder_work_done_at, electrician_work_done_at,
      home_latitude, home_longitude,
      leads!inner(customer_name, mobile, address, village_city, district, k_number)
    `
    )
    .eq(assignmentColumn, userId)
    .in('status', ['installation_scheduled', 'installation_completed'])
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);

  const jobs = (data ?? []) as unknown as TradeJob[];
  if (jobs.length === 0) return jobs;

  const { data: photos } = await supabase
    .from('documents')
    .select('project_id')
    .eq('document_type', TRADE_PHOTO[trade].documentType)
    .not('file_url', 'is', null)
    .in(
      'project_id',
      jobs.map((j) => j.id)
    );

  const withPhoto = new Set((photos ?? []).map((p) => p.project_id));
  return jobs.map((job) => ({ ...job, hasPhoto: withPhoto.has(job.id) }));
};

export const isTradeDone = (job: TradeJob, trade: Trade): boolean =>
  trade === 'welder'
    ? Boolean(job.welder_work_done_at)
    : Boolean(job.electrician_work_done_at);

/** Google Maps link, preferring saved coordinates over a text address. */
export const mapsLinkFor = (job: TradeJob): string => {
  if (job.home_latitude && job.home_longitude) {
    return `https://www.google.com/maps/search/?api=1&query=${job.home_latitude},${job.home_longitude}`;
  }
  const address = [job.leads?.address, job.leads?.village_city, job.leads?.district]
    .filter(Boolean)
    .join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
};
