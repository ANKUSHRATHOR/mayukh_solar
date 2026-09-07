/**
 * One shape for the quotation document, whichever record it came from.
 *
 * A lead quotation lives in the `leads.quotation_details` JSONB and carries the
 * subsidy; a project quotation lives in the `quotations` table and carries the
 * payment schedule and bank account. Both describe the same customer-facing
 * document, so both normalise to this before rendering — otherwise the two
 * entry points drift, which is exactly what happened to the five copies of
 * quotation markup this replaces.
 *
 * Pure: no supabase import, so it is unit-testable. Same discipline as
 * payments.ts and plantDetails.ts.
 */

import { buildSchedule, formatMoney, scheduleFor } from '@/lib/payments';
import { parseUnit } from '@/lib/plantDetails';
import type { LeadQuotation } from '@/lib/leadQuotations';

export interface QuotationVendor {
  firmName: string;
  address: string;
  gstin: string;
  licenseNo: string;
  mobile: string;
  email: string;
  logoUrl: string | null;
  signatureUrl: string | null;
}

export interface BomRow {
  sno: number;
  description: string;
  spec: string;
  qty: string;
}

/** A standing row, as stored in `system_configs.quotation_bom_rows`. */
export interface BomTemplateRow {
  description: string;
  spec: string;
  qty: string;
}

export interface ScheduleRow {
  installment: string;
  stage: string;
  /** Human share, e.g. "30%". Empty when the bank decides the split. */
  share: string;
  /** Null when the amount depends on the loan sanction. */
  amount: number | null;
  dueWhen: string;
}

export interface QuotationDocument {
  vendor: QuotationVendor;
  meta: {
    quotationNumber: string;
    date: string;
    validityDays: number;
    capacityKw: string;
    phase: string;
    paymentType: string;
    kNumber: string;
    projectCode: string;
  };
  customer: { name: string; address: string; mobile: string };
  bom: BomRow[];
  pricing: {
    turnkey: number;
    subsidy: number;
    net: number;
    /** What the customer actually pays — the schedule is computed from this. */
    quotePrice: number;
  };
  schedule: ScheduleRow[];
  terms: { title: string; body: string }[];
  bank: {
    holderName: string;
    bankName: string;
    accountNo: string;
    accountType: string;
    ifsc: string;
    branch: string;
    upiImageUrl: string | null;
  } | null;
}

/** The offer window quoted on the document. Matches the seeded T&C row. */
export const QUOTATION_VALIDITY_DAYS = 30;

const text = (value: unknown, fallback = ''): string => {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s === '' ? fallback : s;
};

const formatDate = (value: string | null | undefined): string =>
  new Date(value ?? Date.now()).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

/**
 * Vendor block with fallbacks.
 *
 * `vendor_profiles` RLS has changed hands more than once — operators were
 * granted read access and later had it revoked — so the row can legitimately
 * come back null. The letterhead degrades to the firm name rather than
 * rendering an empty header.
 */
export const toVendor = (row: Record<string, unknown> | null | undefined): QuotationVendor => ({
  firmName: text(row?.firm_name, 'V R ENTERPRISES'),
  address: text(row?.address),
  gstin: text(row?.gstin),
  licenseNo: text(row?.license_no),
  mobile: text(row?.mobile),
  email: text(row?.email),
  logoUrl: text(row?.logo_url) || null,
  signatureUrl: text(row?.signature_url) || null,
});

/** Bank block from the vendor profile, which already carries the firm's account. */
const vendorBank = (
  vendor: Record<string, unknown> | null | undefined
): QuotationDocument['bank'] =>
  vendor?.account_no
    ? {
        holderName: text(vendor.firm_name),
        bankName: text(vendor.bank_name),
        accountNo: text(vendor.account_no),
        accountType: text(vendor.account_type, 'Current Account'),
        ifsc: text(vendor.ifsc),
        branch: '',
        upiImageUrl: null,
      }
    : null;

/**
 * Rows 1-3 come from the quotation's own specs; the rest are the standing rows
 * an admin maintains in Settings. Numbering is applied last so a configuration
 * change cannot leave a gap.
 */
const buildBom = (
  specs: {
    panelBrand: string;
    panelWatt: string;
    structure: string;
    inverterBrand: string;
    inverterCapacity: string;
    phase: string;
  },
  standing: BomTemplateRow[]
): BomRow[] => {
  const panelSpec = [specs.panelBrand, specs.panelWatt && `${specs.panelWatt}WP`]
    .filter(Boolean)
    .join(' ');
  const inverterSpec = [
    specs.inverterBrand,
    specs.inverterCapacity && `${specs.inverterCapacity} KW`,
    specs.phase,
  ]
    .filter(Boolean)
    .join(' ');

  const generated: BomTemplateRow[] = [
    {
      description: 'Solar PV Modules (Bifacial, Mono-Crystalline, TOPCon)',
      spec: panelSpec || 'As per approved make list',
      qty: 'As Required',
    },
    {
      description: 'Mounting Structure',
      spec: specs.structure || 'GI Rust-Free Fixed Type',
      qty: '1 Set',
    },
    {
      description: 'Solar Inverter',
      spec: inverterSpec || 'As per approved make list',
      qty: '1 Unit',
    },
  ];

  return [...generated, ...standing].map((row, i) => ({ sno: i + 1, ...row }));
};

/**
 * The payment milestones this deal will actually be invoiced against.
 *
 * Built from the same CASH_SCHEDULE / LOAN_SCHEDULE the project tracks, so the
 * quotation cannot promise terms the app will not bill. `buildSchedule` is
 * reused with no recorded payments — this is a quotation, nothing is received
 * yet — purely to get its expected-amount arithmetic.
 */
export const toSchedule = (
  paymentType: string | null | undefined,
  amount: number,
  loanAmount?: number | null
): ScheduleRow[] => {
  const ordinal = ['1st', '2nd', '3rd', '4th', '5th'];
  return buildSchedule(paymentType, amount, [], loanAmount).map((line, i) => ({
    installment: ordinal[i] ?? `${i + 1}th`,
    stage: line.label,
    share: line.share !== null ? `${Math.round(line.share * 100)}%` : '',
    amount: line.expected,
    dueWhen: line.dueWhen,
  }));
};

/** Total of the schedule, for the "must equal the quoted price" check. */
export const scheduleTotal = (rows: ScheduleRow[]): number =>
  rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);

export interface LeadLike {
  customer_name?: string | null;
  mobile?: string | null;
  address?: string | null;
  village_city?: string | null;
  district?: string | null;
  state?: string | null;
  k_number?: string | null;
  plant_details?: unknown;
}

export const fromLeadQuotation = (input: {
  quotation: LeadQuotation;
  lead: LeadLike;
  vendor: Record<string, unknown> | null;
  terms: { title: string; body: string }[];
  bomRows: BomTemplateRow[];
  paymentType?: string | null;
}): QuotationDocument => {
  const { quotation: q, lead, vendor, terms, bomRows } = input;
  const plant = (lead.plant_details && typeof lead.plant_details === 'object'
    ? lead.plant_details
    : {}) as Record<string, unknown>;

  const turnkey = Number(q.total_cost ?? 0);
  const subsidy = Number(q.subsidy_amount ?? 0);
  const quotePrice = Number(q.quote_price ?? q.net_cost ?? Math.max(0, turnkey - subsidy));

  return {
    vendor: toVendor(vendor),
    meta: {
      quotationNumber: text(q.quotation_number, 'DRAFT'),
      date: formatDate(q.created_at),
      validityDays: QUOTATION_VALIDITY_DAYS,
      capacityKw: text(q.capacity_kw),
      phase: text(q.phase ?? plant.phase),
      paymentType: text(input.paymentType, 'cash'),
      kNumber: text(lead.k_number),
      projectCode: '',
    },
    customer: {
      name: text(lead.customer_name, 'Customer'),
      address: [lead.address, lead.village_city, lead.district, lead.state]
        .filter(Boolean)
        .join(', '),
      mobile: text(lead.mobile),
    },
    bom: buildBom(
      {
        panelBrand: text(q.panel_brand ?? plant.panel_make),
        panelWatt: String(parseUnit(q.panel_watt ?? plant.panel_wt) ?? ''),
        structure: text(q.structure_type ?? plant.structure_type_gauge_make),
        inverterBrand: text(q.inverter_brand ?? plant.inverter),
        inverterCapacity: String(parseUnit(q.inverter_capacity ?? plant.inverter_wt) ?? ''),
        phase: text(q.phase ?? plant.phase),
      },
      bomRows
    ),
    pricing: { turnkey, subsidy, net: Math.max(0, turnkey - subsidy), quotePrice },
    schedule: toSchedule(input.paymentType ?? 'cash', quotePrice),
    terms,
    bank: vendorBank(vendor),
  };
};

export interface ProjectLike {
  k_number?: string | null;
  project_code?: string | null;
  capacity_kw?: number | null;
  panel_brand?: string | null;
  panel_watt?: number | null;
  inverter_brand?: string | null;
  inverter_capacity?: number | null;
  structure_type?: string | null;
  phase?: string | null;
  payment_type?: string | null;
  final_amount?: number | null;
  subsidy_amount?: number | null;
  loan_bank?: string | null;
  leads?: {
    customer_name?: string | null;
    mobile?: string | null;
    address?: string | null;
    village_city?: string | null;
    district?: string | null;
    state?: string | null;
  } | null;
}

export const fromProject = (input: {
  project: ProjectLike;
  quotationNumber: string;
  createdAt?: string | null;
  vendor: Record<string, unknown> | null;
  terms: { title: string; body: string }[];
  bomRows: BomTemplateRow[];
  bankAccount?: Record<string, unknown> | null;
}): QuotationDocument => {
  const { project: p, vendor, terms, bomRows, bankAccount } = input;

  const quotePrice = Number(p.final_amount ?? 0);
  const subsidy = Number(p.subsidy_amount ?? 0);

  return {
    vendor: toVendor(vendor),
    meta: {
      quotationNumber: text(input.quotationNumber, 'DRAFT'),
      date: formatDate(input.createdAt),
      validityDays: QUOTATION_VALIDITY_DAYS,
      capacityKw: text(p.capacity_kw),
      phase: text(p.phase),
      paymentType: text(p.payment_type, 'cash'),
      kNumber: text(p.k_number),
      projectCode: text(p.project_code),
    },
    customer: {
      name: text(p.leads?.customer_name, 'Customer'),
      address: [p.leads?.address, p.leads?.village_city, p.leads?.district, p.leads?.state]
        .filter(Boolean)
        .join(', '),
      mobile: text(p.leads?.mobile),
    },
    bom: buildBom(
      {
        panelBrand: text(p.panel_brand),
        panelWatt: String(parseUnit(p.panel_watt) ?? ''),
        structure: text(p.structure_type).replace(/_/g, ' '),
        inverterBrand: text(p.inverter_brand),
        inverterCapacity: String(parseUnit(p.inverter_capacity) ?? ''),
        phase: text(p.phase),
      },
      bomRows
    ),
    // final_amount is what the customer pays; the subsidy is shown as the credit
    // that produced it, so turnkey is reconstructed rather than invented.
    pricing: {
      turnkey: quotePrice + subsidy,
      subsidy,
      net: quotePrice,
      quotePrice,
    },
    schedule: toSchedule(p.payment_type, quotePrice),
    terms,
    bank: bankAccount
      ? {
          holderName: text(bankAccount.holder_name, text(vendor?.firm_name)),
          bankName: text(bankAccount.bank_name),
          accountNo: text(bankAccount.account_no),
          accountType: text(bankAccount.account_type, 'Current Account'),
          ifsc: text(bankAccount.ifsc),
          branch: text(bankAccount.branch_name),
          upiImageUrl: text(bankAccount.upi_image_url) || null,
        }
      : vendorBank(vendor),
  };
};

/** Re-exported so the template does not reach into payments.ts directly. */
export { formatMoney, scheduleFor };
