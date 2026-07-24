import type { StatusMeta } from '@/lib/statusMeta';

/**
 * The 12-stage project pipeline.
 *
 * Wiring, material dispatch and inspection are deliberately NOT stages here —
 * they are sub-steps inside Installation, tracked on the project row and in
 * `documents`. That keeps the welder and electrician workflows alive while the
 * customer-facing pipeline stays readable.
 */
export type ProjectStage =
  | 'new_project'
  | 'documents_pending'
  | 'documents_approved'
  | 'loan_application_pending'
  | 'loan_approved'
  | 'installation_scheduled'
  | 'installation_completed'
  | 'net_meter_applied'
  | 'net_meter_installed'
  | 'payment_pending'
  | 'project_completed'
  | 'closed';

export interface StageDefinition extends StatusMeta {
  stage: ProjectStage;
  /** Who normally performs the transition into this stage. */
  owner: 'sales' | 'operator' | 'welder' | 'electrician' | 'finance' | 'system';
  /** `loan` stages are skipped for cash projects, and vice versa. */
  appliesTo: 'all' | 'loan' | 'cash';
  /** One line explaining what has to be true to reach this stage. */
  requirement?: string;
}

export const PROJECT_STAGES: StageDefinition[] = [
  {
    stage: 'new_project',
    label: 'New Project',
    tone: 'info',
    owner: 'sales',
    appliesTo: 'all',
  },
  {
    stage: 'documents_pending',
    label: 'Documents Pending',
    tone: 'warning',
    owner: 'sales',
    appliesTo: 'all',
    requirement: 'Customer documents need to be uploaded.',
  },
  {
    stage: 'documents_approved',
    label: 'Documents Approved',
    tone: 'progress',
    owner: 'operator',
    appliesTo: 'all',
    requirement: 'Every uploaded document must be verified by an operator.',
  },
  {
    stage: 'loan_application_pending',
    label: 'Loan Application Pending',
    tone: 'warning',
    owner: 'finance',
    appliesTo: 'loan',
    requirement: 'Documents verified and the loan file submitted to the bank.',
  },
  {
    stage: 'loan_approved',
    label: 'Loan Approved',
    tone: 'progress',
    owner: 'finance',
    appliesTo: 'loan',
    requirement: 'Bank has sanctioned the loan.',
  },
  {
    stage: 'installation_scheduled',
    label: 'Installation Scheduled',
    tone: 'progress',
    owner: 'operator',
    appliesTo: 'all',
    requirement:
      'Home location saved. On loan files, the bank’s first installment must be received before fabrication starts.',
  },
  {
    stage: 'installation_completed',
    label: 'Installation Completed',
    tone: 'progress',
    owner: 'operator',
    appliesTo: 'all',
    requirement:
      'Welder and electrician have both marked their work done and uploaded plant photos.',
  },
  {
    stage: 'net_meter_applied',
    label: 'Net Meter Applied',
    tone: 'info',
    owner: 'operator',
    appliesTo: 'all',
    requirement: 'Panel and inverter serial numbers recorded.',
  },
  {
    stage: 'net_meter_installed',
    label: 'Net Meter Installed',
    tone: 'info',
    owner: 'operator',
    appliesTo: 'all',
  },
  {
    stage: 'payment_pending',
    label: 'Payment Pending',
    tone: 'warning',
    owner: 'finance',
    appliesTo: 'all',
    requirement: 'Final balance is being collected.',
  },
  {
    stage: 'project_completed',
    label: 'Project Completed',
    tone: 'success',
    owner: 'finance',
    appliesTo: 'all',
    requirement: 'All payments received in full.',
  },
  {
    stage: 'closed',
    label: 'Closed',
    tone: 'neutral',
    owner: 'system',
    appliesTo: 'all',
  },
];

export const stageByKey = new Map(PROJECT_STAGES.map((s) => [s.stage, s]));

/** Stage map in the shape `StatusBadge` expects. */
export const projectStageMeta: Record<string, StatusMeta> = Object.fromEntries(
  PROJECT_STAGES.map((s) => [s.stage, { label: s.label, tone: s.tone }])
);

/**
 * The pipeline a given project actually walks. Cash projects skip the two loan
 * stages, so their progress bar doesn't show steps they can never reach.
 */
export const pipelineFor = (paymentType: string | null | undefined): StageDefinition[] =>
  PROJECT_STAGES.filter((s) =>
    s.appliesTo === 'all' ? true : paymentType === 'loan' ? s.appliesTo === 'loan' : false
  );

/** Zero-based position in this project's pipeline; -1 when off-pipeline. */
export const stageIndex = (
  stage: string | null | undefined,
  paymentType: string | null | undefined
): number => pipelineFor(paymentType).findIndex((s) => s.stage === stage);

/** Percentage complete, for progress bars. */
export const stageProgress = (
  stage: string | null | undefined,
  paymentType: string | null | undefined
): number => {
  const pipeline = pipelineFor(paymentType);
  const index = stageIndex(stage, paymentType);
  if (index < 0 || pipeline.length <= 1) return 0;
  return Math.round((index / (pipeline.length - 1)) * 100);
};

/** The stage an operator would normally move to next, or null at the end. */
export const nextStage = (
  stage: string | null | undefined,
  paymentType: string | null | undefined
): StageDefinition | null => {
  const pipeline = pipelineFor(paymentType);
  const index = stageIndex(stage, paymentType);
  if (index < 0 || index >= pipeline.length - 1) return null;
  return pipeline[index + 1];
};

/**
 * Legacy stages predating the 12-stage pipeline. Retained so historical rows
 * and any straggler still render a sensible label — Postgres cannot drop enum
 * values, so these remain valid in the database indefinitely.
 */
export const LEGACY_STAGE_LABELS: Record<string, string> = {
  pending_documents: 'Documents Pending (legacy)',
  pending_operator_review: 'Operator Review (legacy)',
  registration_pending: 'Registration Pending (legacy)',
  registration_done: 'Registration Done (legacy)',
  loan_process: 'Loan In Process (legacy)',
  loan_done: 'Loan Disbursed (legacy)',
  cash_file: 'Cash File (legacy)',
  material_ordered: 'Material Ordered (legacy)',
  material_dispatched: 'Material Dispatched (legacy)',
  material_delivered: 'Material Delivered (legacy)',
  installation_pending: 'Installation Pending (legacy)',
  installation_done: 'Installation Done (legacy)',
  wiring_pending: 'Wiring Pending (legacy)',
  wiring_done: 'Wiring Done (legacy)',
  net_metering_submitted: 'Net Metering Submitted (legacy)',
  inspection_scheduled: 'Inspection Scheduled (legacy)',
  inspection_completed: 'Inspection Completed (legacy)',
  inspection_failed: 'Inspection Failed (legacy)',
};

/** Combined map so any stored value renders, new or legacy. */
export const allProjectStageMeta: Record<string, StatusMeta> = {
  ...projectStageMeta,
  ...Object.fromEntries(
    Object.entries(LEGACY_STAGE_LABELS).map(([key, label]) => [
      key,
      { label, tone: 'neutral' as const },
    ])
  ),
};
