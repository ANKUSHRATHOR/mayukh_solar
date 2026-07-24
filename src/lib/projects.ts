import { supabase } from '@/integrations/supabase/client';
import { applyPaging, toTablePage } from '@/lib/tableQuery';
import type { TableQueryParams, TablePage } from '@/hooks/useServerTable';

/**
 * Data access for projects.
 *
 * Identity note: a project is identified to users by K-Number, then customer
 * name, then mobile — never by `project_code` or the row id. Search and display
 * follow that order throughout.
 */

export interface ProjectRow {
  id: string;
  lead_id: string;
  k_number: string | null;
  project_code: string;
  capacity_kw: number;
  panel_brand: string;
  panel_qty: number;
  panel_watt: number;
  inverter_brand: string;
  inverter_capacity: number;
  structure_type: string;
  final_amount: number;
  discount: number | null;
  payment_type: 'cash' | 'loan';
  loan_bank: string | null;
  loan_disbursed: boolean;
  status: string;
  consumer_name: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
  assigned_sales_person_id: string | null;
  assigned_operator_id: string | null;
  assigned_welder_id: string | null;
  assigned_electrician_id: string | null;
  welder_work_done_at: string | null;
  electrician_work_done_at: string | null;
  documents_submitted_by_sales: boolean;
  special_notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  leads?: {
    id: string;
    customer_name: string;
    mobile: string;
    email: string | null;
    address: string | null;
    village_city: string | null;
    district: string | null;
    state: string | null;
    k_number: string | null;
  } | null;
}

const SELECT_COLUMNS = `
  *,
  leads!inner(
    id, customer_name, mobile, email,
    address, village_city, district, state, k_number
  )
`;

export type ProjectTab = 'all' | 'cash' | 'loan';

/**
 * One page of projects.
 *
 * Search spans the project's own K-Number and the lead's K-Number, name and
 * mobile. PostgREST cannot `or()` across an embedded resource in one
 * expression, so a term is matched against the project columns directly and
 * against the lead via a pre-resolved id list.
 */
export const fetchProjectsPage = async (
  params: TableQueryParams
): Promise<TablePage<ProjectRow>> => {
  const { tab, stage } = params.filters as { tab?: ProjectTab; stage?: string };
  const term = params.search.trim().replace(/[,()*]/g, ' ').trim();

  let query = supabase.from('projects').select(SELECT_COLUMNS, { count: 'exact' });

  if (tab === 'cash') query = query.eq('payment_type', 'cash');
  if (tab === 'loan') query = query.eq('payment_type', 'loan');
  if (stage) query = query.eq('status', stage as any);

  if (term) {
    const { data: matchingLeads } = await supabase
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

    const leadIds = (matchingLeads ?? []).map((l) => l.id);
    const clauses = [`k_number.ilike.%${term}%`];
    if (leadIds.length > 0) clauses.push(`lead_id.in.(${leadIds.join(',')})`);
    query = query.or(clauses.join(','));
  }

  const result = await applyPaging(query, params);
  return toTablePage<ProjectRow>(result as any);
};

export const fetchProject = async (id: string): Promise<ProjectRow | null> => {
  const { data, error } = await supabase
    .from('projects')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  // Cast through unknown: welder_work_done_at and electrician_work_done_at were
  // added in 20260719000100 and postdate the last types.ts generation.
  return (data as unknown as ProjectRow | null) ?? null;
};

/** Counts per tab, for the tab badges. */
export const fetchProjectTabCounts = async (): Promise<Record<ProjectTab, number>> => {
  const countOf = async (tab: ProjectTab) => {
    let q = supabase.from('projects').select('id', { count: 'exact', head: true });
    if (tab === 'cash') q = q.eq('payment_type', 'cash');
    if (tab === 'loan') q = q.eq('payment_type', 'loan');
    const { count } = await q;
    return count ?? 0;
  };

  const [all, cash, loan] = await Promise.all([countOf('all'), countOf('cash'), countOf('loan')]);
  return { all, cash, loan };
};

export interface StageRequirements {
  documents_uploaded: boolean;
  documents_verified: boolean;
  home_location_saved: boolean;
  serial_numbers_entered: boolean;
  material_dispatched: boolean;
  welder_assigned: boolean;
  electrician_assigned: boolean;
  welder_work_done: boolean;
  electrician_work_done: boolean;
  structure_photo_uploaded: boolean;
  wiring_photo_uploaded: boolean;
  loan_first_installment_received: boolean;
  is_loan: boolean;
  balance_due: number;
  fully_paid: boolean;
}

export const fetchStageRequirements = async (
  projectId: string
): Promise<StageRequirements | null> => {
  const { data, error } = await supabase.rpc('project_stage_requirements', {
    _project_id: projectId,
  });
  if (error) throw new Error(error.message);
  return (data as unknown as StageRequirements) ?? null;
};

/**
 * How a project should be labelled in lists and headings: K-Number first,
 * falling back through name and mobile. Never the project code or row id.
 */
export const projectIdentity = (project: ProjectRow) => {
  const kNumber = project.k_number ?? project.leads?.k_number ?? null;
  return {
    kNumber,
    name: project.leads?.customer_name ?? project.consumer_name ?? 'Unnamed customer',
    mobile: project.leads?.mobile ?? null,
    /** Single-line label for headings and page titles. */
    primary: kNumber ?? project.leads?.customer_name ?? project.consumer_name ?? 'Project',
  };
};
