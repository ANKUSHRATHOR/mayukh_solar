import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

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
 * Signed URL for a stored document.
 *
 * Signed on read rather than persisted — `material_dispatches` stores a
 * one-year signed URL as if permanent, so every link there breaks after 365
 * days. Storing the path and signing on demand avoids repeating that.
 */
export const getDocumentUrl = async (path: string, expiresInSeconds = 3600): Promise<string> => {
  const { data, error } = await supabase.storage
    .from('project-documents')
    .createSignedUrl(path, expiresInSeconds);

  if (error) throw new Error(error.message);
  if (!data?.signedUrl) throw new Error('Could not create a link to this document.');
  return data.signedUrl;
};

/** Preserves the real file extension — the download helper used to force `.bin`. */
export const downloadDocument = async (path: string, label: string): Promise<void> => {
  const url = await getDocumentUrl(path, 120);
  const extension = path.split('.').pop() ?? 'pdf';
  const safeLabel = label.replace(/[^a-z0-9]+/gi, '_').toLowerCase();

  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not download this document.');
  const blob = await response.blob();

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `${safeLabel}.${extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
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
