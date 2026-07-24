/**
 * One place defining how every domain status looks and reads.
 *
 * Pages previously kept their own partial maps — AdminLeadsList's covered 7 of
 * 11 lead statuses, so a "Quotation Accepted" lead rendered the same blue badge
 * as a brand-new one. Anything missing here falls back to a neutral tone rather
 * than silently borrowing another status's colour.
 */

export type StatusTone =
  | 'neutral'
  | 'info'
  | 'progress'
  | 'success'
  | 'warning'
  | 'danger';

export interface StatusMeta {
  label: string;
  tone: StatusTone;
}

export const toneClasses: Record<StatusTone, string> = {
  neutral: 'bg-muted text-muted-foreground border-transparent',
  info: 'bg-blue-100 text-blue-800 border-transparent dark:bg-blue-500/15 dark:text-blue-300',
  progress: 'bg-orange-100 text-orange-800 border-transparent dark:bg-orange-500/15 dark:text-orange-300',
  success: 'bg-emerald-100 text-emerald-800 border-transparent dark:bg-emerald-500/15 dark:text-emerald-300',
  warning: 'bg-yellow-100 text-yellow-800 border-transparent dark:bg-yellow-500/15 dark:text-yellow-300',
  danger: 'bg-red-100 text-red-800 border-transparent dark:bg-red-500/15 dark:text-red-300',
};

/** All 11 values of the `lead_status` enum. */
export const leadStatusMeta: Record<string, StatusMeta> = {
  new: { label: 'New', tone: 'info' },
  visit_created: { label: 'Visit Booked', tone: 'progress' },
  visited: { label: 'Visited', tone: 'progress' },
  follow_up: { label: 'Follow Up', tone: 'warning' },
  interested: { label: 'Interested', tone: 'success' },
  quotation_sent: { label: 'Quotation Sent', tone: 'info' },
  quotation_accepted: { label: 'Quotation Accepted', tone: 'success' },
  quotation_rejected: { label: 'Quotation Rejected', tone: 'danger' },
  not_interested: { label: 'Not Interested', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  final: { label: 'Final', tone: 'success' },
};

/** All 20 values of the `project_status` enum, in pipeline order. */
export const projectStatusMeta: Record<string, StatusMeta> = {
  pending_documents: { label: 'Pending Documents', tone: 'warning' },
  pending_operator_review: { label: 'Pending Operator Review', tone: 'warning' },
  registration_pending: { label: 'Registration Pending', tone: 'progress' },
  registration_done: { label: 'Registration Done', tone: 'progress' },
  loan_process: { label: 'Loan In Process', tone: 'progress' },
  loan_done: { label: 'Loan Disbursed', tone: 'progress' },
  cash_file: { label: 'Cash File', tone: 'progress' },
  material_ordered: { label: 'Material Ordered', tone: 'progress' },
  material_dispatched: { label: 'Material Dispatched', tone: 'progress' },
  material_delivered: { label: 'Material Delivered', tone: 'progress' },
  installation_pending: { label: 'Installation Pending', tone: 'progress' },
  installation_done: { label: 'Installation Done', tone: 'progress' },
  wiring_pending: { label: 'Wiring Pending', tone: 'progress' },
  wiring_done: { label: 'Wiring Done', tone: 'progress' },
  net_metering_submitted: { label: 'Net Metering Submitted', tone: 'info' },
  inspection_scheduled: { label: 'Inspection Scheduled', tone: 'info' },
  inspection_completed: { label: 'Inspection Completed', tone: 'info' },
  inspection_failed: { label: 'Inspection Failed', tone: 'danger' },
  net_meter_installed: { label: 'Net Meter Installed', tone: 'info' },
  project_completed: { label: 'Project Completed', tone: 'success' },
};

export const quotationStatusMeta: Record<string, StatusMeta> = {
  pending: { label: 'Draft', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  expired: { label: 'Expired', tone: 'warning' },
  superseded: { label: 'Superseded', tone: 'neutral' },
};

export const taskStatusMeta: Record<string, StatusMeta> = {
  pending: { label: 'Pending', tone: 'warning' },
  in_progress: { label: 'In Progress', tone: 'progress' },
  completed: { label: 'Completed', tone: 'success' },
};

export const taskPriorityMeta: Record<string, StatusMeta> = {
  low: { label: 'Low', tone: 'neutral' },
  medium: { label: 'Medium', tone: 'info' },
  high: { label: 'High', tone: 'warning' },
  urgent: { label: 'Urgent', tone: 'danger' },
};

export const attendanceStatusMeta: Record<string, StatusMeta> = {
  present: { label: 'Present', tone: 'success' },
  late: { label: 'Late', tone: 'warning' },
  half_day: { label: 'Half Day', tone: 'warning' },
  absent: { label: 'Absent', tone: 'danger' },
  leave: { label: 'Leave', tone: 'info' },
};

export const requestStatusMeta: Record<string, StatusMeta> = {
  pending: { label: 'Pending', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  consumed: { label: 'Used', tone: 'neutral' },
};

export const roleMeta: Record<string, StatusMeta> = {
  admin: { label: 'Admin', tone: 'danger' },
  telecaller: { label: 'Telecaller', tone: 'info' },
  sales_person: { label: 'Sales Person', tone: 'success' },
  operator: { label: 'Operator', tone: 'progress' },
  welder: { label: 'Welder', tone: 'warning' },
  electrician: { label: 'Electrician', tone: 'info' },
};

/** Turns `net_metering_submitted` into `Net Metering Submitted`. */
export const humanizeStatus = (value: string): string =>
  value
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/**
 * Looks up a status, falling back to a humanized label with a neutral tone so
 * an unmapped value is visibly plain rather than miscoloured.
 */
export const resolveStatus = (
  map: Record<string, StatusMeta>,
  value: string | null | undefined
): StatusMeta => {
  if (!value) return { label: '—', tone: 'neutral' };
  return map[value] ?? { label: humanizeStatus(value), tone: 'neutral' };
};
