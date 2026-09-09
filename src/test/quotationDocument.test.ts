import { describe, expect, it } from 'vitest';
import {
  fromLeadQuotation,
  fromProject,
  scheduleTotal,
  toSchedule,
  toVendor,
  type BomTemplateRow,
} from '@/lib/quotationDocument';
import { buildQuotationHtml } from '@/lib/quotationTemplate';
import type { LeadQuotation } from '@/lib/leadQuotations';

const vendorRow = {
  firm_name: 'V R ENTERPRISES',
  address: '20, Sector-7 Keshavpura, Kota, Rajasthan',
  gstin: '08BUMPR6551G2Z3',
  license_no: 'CBLF240508063117807',
  mobile: '+91-9782767546',
  bank_name: 'IDFC FIRST',
  account_no: '79950673116',
  account_type: 'CURRENT ACCOUNT',
  ifsc: 'IDFB0042542',
};

const bomRows: BomTemplateRow[] = [
  { description: 'ACDB-DCDB', spec: 'SPD: Phoenix', qty: '1 Set' },
  { description: 'Earthing Kit', spec: 'True Power', qty: '3 Nos' },
];

const terms = [{ title: 'Site Visit & Costing', body: 'Final cost after site visit.' }];

const leadQuote = {
  quotation_number: 'MS-Q-483920-01',
  capacity_kw: 5,
  panel_brand: 'INA',
  panel_watt: 620,
  inverter_brand: 'XWATT',
  inverter_capacity: 5,
  phase: 'Single Phase',
  total_cost: 240000,
  subsidy_amount: 78000,
  quote_price: 162000,
  created_at: '2026-08-22T00:00:00.000Z',
} as unknown as LeadQuotation;

const lead = {
  customer_name: 'Hansraj Meena',
  mobile: '9929430472',
  village_city: 'Kota',
  state: 'Rajasthan',
  k_number: '210742009699',
};

describe('vendor block', () => {
  it('falls back to the firm name when the profile is unreadable', () => {
    // vendor_profiles RLS has been granted and revoked more than once, so null
    // is a real case, not a defensive nicety.
    const v = toVendor(null);
    expect(v.firmName).toBe('V R ENTERPRISES');
    expect(v.gstin).toBe('');
    expect(v.logoUrl).toBeNull();
  });

  it('reads the seeded profile including licence and branding', () => {
    const v = toVendor({ ...vendorRow, logo_url: 'https://x/logo.png' });
    expect(v.licenseNo).toBe('CBLF240508063117807');
    expect(v.logoUrl).toBe('https://x/logo.png');
    expect(v.signatureUrl).toBeNull();
  });
});

describe('payment schedule', () => {
  it('uses the cash milestones and sums to the quoted price', () => {
    const rows = toSchedule('cash', 162000);
    expect(rows.map((r) => r.share)).toEqual(['30%', '60%', '10%']);
    expect(scheduleTotal(rows)).toBe(162000);
  });

  it('uses the loan milestones, leaving bank amounts to the sanction', () => {
    const rows = toSchedule('loan', 162000);
    expect(rows.length).toBeGreaterThan(1);
    // The bank decides its own split, so those lines carry no fixed amount.
    expect(rows.some((r) => r.amount === null)).toBe(true);
  });

  it('is computed from the quoted price, not the gross', () => {
    // The sample PDF billed 100% of the pre-subsidy figure while its total was
    // the post-subsidy one. The schedule must follow what the customer pays.
    const doc = fromLeadQuotation({ quotation: leadQuote, lead, vendor: vendorRow, terms, bomRows });
    expect(scheduleTotal(doc.schedule)).toBe(162000);
    expect(scheduleTotal(doc.schedule)).not.toBe(240000);
  });
});

describe('bill of material', () => {
  it('generates the spec rows from the quotation and appends the standing rows', () => {
    const doc = fromLeadQuotation({ quotation: leadQuote, lead, vendor: vendorRow, terms, bomRows });
    expect(doc.bom).toHaveLength(5);
    expect(doc.bom[0].sno).toBe(1);
    expect(doc.bom[0].spec).toContain('INA');
    expect(doc.bom[0].spec).toContain('620WP');
    expect(doc.bom[2].spec).toContain('XWATT');
    expect(doc.bom[2].spec).toContain('5 KW');
    // Numbering is continuous across generated and standing rows.
    expect(doc.bom.map((r) => r.sno)).toEqual([1, 2, 3, 4, 5]);
  });

  it('never leaves a spec cell empty', () => {
    const bare = { quotation_number: 'X-1' } as unknown as LeadQuotation;
    const doc = fromLeadQuotation({ quotation: bare, lead: {}, vendor: null, terms, bomRows: [] });
    expect(doc.bom.every((r) => r.spec.trim().length > 0)).toBe(true);
  });
});

describe('pricing', () => {
  it('keeps turnkey, subsidy and net consistent for a lead', () => {
    const doc = fromLeadQuotation({ quotation: leadQuote, lead, vendor: vendorRow, terms, bomRows });
    expect(doc.pricing.turnkey).toBe(240000);
    expect(doc.pricing.subsidy).toBe(78000);
    expect(doc.pricing.quotePrice).toBe(162000);
    expect(doc.pricing.turnkey - doc.pricing.subsidy).toBe(doc.pricing.quotePrice);
  });

  it('reconstructs the turnkey from a project, which stores only what is payable', () => {
    const doc = fromProject({
      project: { final_amount: 162000, subsidy_amount: 78000, payment_type: 'cash' },
      quotationNumber: 'QT-2026-0001',
      vendor: vendorRow,
      terms,
      bomRows,
    });
    expect(doc.pricing.quotePrice).toBe(162000);
    expect(doc.pricing.turnkey).toBe(240000);
  });
});

describe('both sources produce the same document shape', () => {
  it('lead and project agree on every top-level key', () => {
    const a = fromLeadQuotation({ quotation: leadQuote, lead, vendor: vendorRow, terms, bomRows });
    const b = fromProject({
      project: { final_amount: 162000, payment_type: 'cash' },
      quotationNumber: 'QT-2026-0001',
      vendor: vendorRow,
      terms,
      bomRows,
    });
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(Object.keys(a.meta).sort()).toEqual(Object.keys(b.meta).sort());
  });

  it('gives the lead the bank block it never used to render', () => {
    const doc = fromLeadQuotation({ quotation: leadQuote, lead, vendor: vendorRow, terms, bomRows });
    expect(doc.bank?.accountNo).toBe('79950673116');
    expect(doc.bank?.ifsc).toBe('IDFB0042542');
  });
});

describe('template', () => {
  const doc = fromLeadQuotation({ quotation: leadQuote, lead, vendor: vendorRow, terms, bomRows });
  const html = buildQuotationHtml(doc);

  it('renders three A4 pages with break markers', () => {
    expect(html.match(/class="q-page/g)).toHaveLength(3);
    // quotationPdf's pagebreak config keys off this class.
    expect(html.match(/q-page-break/g)).toHaveLength(2);
  });

  it('carries its own styles, since the print window has no stylesheet', () => {
    expect(html).toContain('<style>');
    expect(html).toContain('210mm');
  });

  it('uses no colour html2canvas cannot rasterise', () => {
    expect(html).not.toContain('oklch');
    expect(html).not.toContain('var(--');
  });

  it('escapes customer data rather than injecting it', () => {
    const nasty = fromLeadQuotation({
      quotation: leadQuote,
      lead: { ...lead, customer_name: '<script>alert(1)</script>' },
      vendor: vendorRow,
      terms,
      bomRows,
    });
    const out = buildQuotationHtml(nasty);
    expect(out).not.toContain('<script>alert(1)</script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('includes the sections the lead document never had', () => {
    expect(html).toContain('Bill of Material');
    expect(html).toContain('Payment Schedule');
    expect(html).toContain('Terms &amp; Conditions');
    expect(html).toContain('Bank Details');
    expect(html).toContain('Authorised Signatory');
  });
});
