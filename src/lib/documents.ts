import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import {
  deleteFile,
  downloadFile,
  getFileUrl,
  uploadFile,
  type FileHandle,
} from '@/lib/fileStore';

export type DocumentType = Database['public']['Enums']['document_type'];

/**
 * Document structure, defined once.
 *
 * Three disjoint hardcoded lists previously disagreed with each other and with
 * the enum: the operator's covered 7 of 17 types, so ten rendered as blank
 * labels and collided as `undefined.pdf` in the bulk download. Three enum
 * values had no UI at all.
 */

export type DocumentGroup = 'customer' | 'site' | 'financial' | 'commissioning';

export interface DocumentSpec {
  type: DocumentType;
  label: string;
  group: DocumentGroup;
  /** Blocks document approval when missing. */
  required: boolean;
  /** A text value rather than a file upload (email address, mobile number). */
  isText?: boolean;
  /** Who is expected to provide it. */
  uploadedBy: 'sales' | 'operator' | 'welder' | 'electrician';
  hint?: string;
}

export const DOCUMENT_SPECS: DocumentSpec[] = [
  // Customer identity and account — collected by sales at onboarding.
  { type: 'electricity_bill', label: 'Electricity Bill', group: 'customer', required: true, uploadedBy: 'sales' },
  { type: 'aadhaar_front', label: 'Aadhaar (Front)', group: 'customer', required: true, uploadedBy: 'sales' },
  { type: 'aadhaar_back', label: 'Aadhaar (Back)', group: 'customer', required: true, uploadedBy: 'sales' },
  { type: 'pan_card', label: 'PAN Card', group: 'customer', required: false, uploadedBy: 'sales' },
  { type: 'passport_photo', label: 'Passport Photo', group: 'customer', required: true, uploadedBy: 'sales' },
  { type: 'customer_email', label: 'Customer Email', group: 'customer', required: true, isText: true, uploadedBy: 'sales' },
  { type: 'customer_mobile', label: 'Customer Mobile', group: 'customer', required: true, isText: true, uploadedBy: 'sales' },

  // Site and feasibility.
  { type: 'property_papers', label: 'Property Papers', group: 'site', required: false, uploadedBy: 'sales' },
  { type: 'feasibility', label: 'Feasibility Report', group: 'site', required: false, uploadedBy: 'operator' },

  // Money.
  { type: 'bank_passbook', label: 'Bank Passbook', group: 'financial', required: true, uploadedBy: 'sales' },
  { type: 'subsidy', label: 'Subsidy Document', group: 'financial', required: false, uploadedBy: 'operator' },
  { type: 'invoice', label: 'Invoice', group: 'financial', required: false, uploadedBy: 'operator' },

  // Proof of completed work. The first three had no UI anywhere before this.
  {
    type: 'overall_structure',
    label: 'Structure Photo',
    group: 'commissioning',
    required: false,
    uploadedBy: 'welder',
    hint: 'Required before the welder can mark structure work done.',
  },
  {
    type: 'wiring_connection',
    label: 'Wiring Photo',
    group: 'commissioning',
    required: false,
    uploadedBy: 'electrician',
    hint: 'Required before the electrician can mark wiring done.',
  },
  {
    type: 'panel_serial_numbers',
    label: 'Panel Serial Numbers',
    group: 'commissioning',
    required: false,
    uploadedBy: 'electrician',
  },
  { type: 'netmetering', label: 'Net Metering Document', group: 'commissioning', required: false, uploadedBy: 'operator' },

  { type: 'other', label: 'Other', group: 'site', required: false, uploadedBy: 'operator' },
];

export const documentLabels: Record<DocumentType, string> = Object.fromEntries(
  DOCUMENT_SPECS.map((d) => [d.type, d.label])
) as Record<DocumentType, string>;

export const specByType = new Map(DOCUMENT_SPECS.map((d) => [d.type, d]));

export const GROUP_LABELS: Record<DocumentGroup, string> = {
  customer: 'Customer Documents',
  site: 'Site & Property',
  financial: 'Financial',
  commissioning: 'Installation & Commissioning',
};

export const GROUP_ORDER: DocumentGroup[] = ['customer', 'site', 'financial', 'commissioning'];

export const specsInGroup = (group: DocumentGroup): DocumentSpec[] =>
  DOCUMENT_SPECS.filter((d) => d.group === group);

export interface ProjectDocument {
  id: string;
  project_id: string | null;
  lead_id: string | null;
  document_type: DocumentType;
  file_url: string | null;
  text_value: string | null;
  custom_name: string | null;
  is_verified: boolean | null;
  rejection_reason: string | null;
  uploaded_by_user_id: string;
  uploaded_at: string;
}

export const fetchProjectDocuments = async (projectId: string): Promise<ProjectDocument[]> => {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('project_id', projectId)
    .order('uploaded_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data as ProjectDocument[]) ?? [];
};

/**
 * A `FileHandle` for a document row.
 *
 * Documents live in Google Drive now, and Drive files are private: a read is
 * authorised by the row it hangs off, not by the file id. Everything that
 * wants to show or save a document goes through here so it never has to know
 * whether the file is in Drive or in the pre-migration Supabase bucket.
 */
export const handleFor = (doc: Pick<ProjectDocument, 'id' | 'file_url'>): FileHandle => ({
  ref: doc.file_url,
  table: 'documents',
  rowId: doc.id,
});

/**
 * A URL the browser can render for a document.
 *
 * Drive files come back as object URLs, which must be released — pass the
 * result to `revokeFileUrl` when the view goes away.
 */
export const getDocumentUrl = (doc: Pick<ProjectDocument, 'id' | 'file_url'>): Promise<string> =>
  getFileUrl(handleFor(doc));

/** Saves a document, preserving a readable name and the real extension. */
export const downloadDocument = (
  doc: Pick<ProjectDocument, 'id' | 'file_url'>,
  label: string
): Promise<void> => downloadFile(handleFor(doc), label);

/**
 * Removes a document: the file, then the row. Drive files are trashed rather
 * than purged, so a mis-click is recoverable from the Drive bin.
 */
export const deleteDocument = (doc: Pick<ProjectDocument, 'id' | 'file_url'>): Promise<void> =>
  deleteFile(handleFor(doc));

/** Extension for a stored file, preferring the real one over a guessed one. */
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

const extensionFor = (file: File): string => {
  const raw = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (raw && /^[a-z0-9]{1,5}$/.test(raw)) return raw;
  return MIME_EXTENSIONS[file.type] || 'bin';
};

/**
 * Uploads a document against a project and records it.
 *
 * The one place that knows how a project document is stored: the Drive upload,
 * the extension, and the insert-or-update of the row. Three screens used to
 * carry their own copy of this and had already drifted -- one capped uploads
 * at 10 MB and another at 15 MB, and only one of them checked that the write
 * was actually permitted.
 *
 * That last part matters: PostgREST reports an RLS refusal in `error`, but an
 * RLS-filtered UPDATE is quieter still -- no error at all, simply zero rows
 * touched. So the update asks for the affected row back rather than trusting
 * silence, and a row that never existed for this caller is reported as a
 * permission problem instead of a silent no-op.
 */
export const uploadProjectDocument = async (
  projectId: string,
  userId: string,
  documentType: DocumentType,
  file: File,
  options: { label?: string; customName?: string; leadId?: string | null } = {}
): Promise<void> => {
  const customName = options.customName?.trim() || null;

  let query = supabase
    .from('documents')
    .select('id, file_url')
    .eq('project_id', projectId)
    .eq('document_type', documentType);
  // `other` is the one type that can repeat, told apart by its custom name.
  if (customName) query = query.eq('custom_name', customName);
  const { data: existing } = await query.maybeSingle();

  const slug = customName ? `custom_${Date.now()}` : documentType;
  const ref = await uploadFile({
    scope: 'project',
    ownerId: projectId,
    file,
    filename: `${slug}.${extensionFor(file)}`,
    label: options.label ?? customName ?? documentLabels[documentType] ?? documentType,
    replaceRef: existing?.file_url ?? null,
  });

  if (existing) {
    const { data, error } = await supabase
      .from('documents')
      .update({
        file_url: ref,
        uploaded_at: new Date().toISOString(),
        rejection_reason: null,
        is_verified: false,
        uploaded_by_user_id: userId,
      })
      .eq('id', existing.id)
      .select('id');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('You do not have permission to replace this document.');
    return;
  }

  const { error } = await supabase.from('documents').insert({
    project_id: projectId,
    lead_id: options.leadId ?? null,
    document_type: documentType,
    file_url: ref,
    custom_name: customName,
    uploaded_by_user_id: userId,
    is_verified: false,
  });
  if (error) throw new Error(error.message);
};

/** The text-valued documents (customer email, mobile), saved the same way. */
export const saveProjectDocumentText = async (
  projectId: string,
  userId: string,
  documentType: DocumentType,
  value: string
): Promise<void> => {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Enter a value first.');

  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('project_id', projectId)
    .eq('document_type', documentType)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('documents')
      .update({ text_value: trimmed, uploaded_at: new Date().toISOString(), rejection_reason: null })
      .eq('id', existing.id)
      .select('id');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('You do not have permission to change this.');
    return;
  }

  const { error } = await supabase.from('documents').insert({
    project_id: projectId,
    document_type: documentType,
    text_value: trimmed,
    uploaded_by_user_id: userId,
    is_verified: false,
  });
  if (error) throw new Error(error.message);
};

export interface DocumentProgress {
  requiredTotal: number;
  requiredUploaded: number;
  requiredVerified: number;
  allRequiredUploaded: boolean;
  allUploadedVerified: boolean;
}

export const summariseDocuments = (documents: ProjectDocument[]): DocumentProgress => {
  const required = DOCUMENT_SPECS.filter((d) => d.required);
  const present = (spec: DocumentSpec) =>
    documents.find(
      (d) => d.document_type === spec.type && (d.file_url !== null || d.text_value !== null)
    );

  const uploaded = required.filter((spec) => present(spec));
  const verified = uploaded.filter((spec) => present(spec)?.is_verified === true);
  const withContent = documents.filter((d) => d.file_url !== null || d.text_value !== null);

  return {
    requiredTotal: required.length,
    requiredUploaded: uploaded.length,
    requiredVerified: verified.length,
    allRequiredUploaded: uploaded.length === required.length,
    allUploadedVerified:
      withContent.length > 0 && withContent.every((d) => d.is_verified === true),
  };
};
