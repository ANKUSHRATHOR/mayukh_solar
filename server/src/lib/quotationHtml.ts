export type ScheduleRow = { label: string; stage: string; amount: number };

export const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const STRUCTURE_LABEL: Record<string, string> = {
  rcc_roof: "RCC Roof",
  tin_shed_roof: "Tin Shed Roof",
  ground_mount: "Ground Mount",
};

export interface QuotationHtmlInput {
  quotationNumber: string;
  quotationType: "bank" | "consumer";
  today: string;
  project: any;
  lead: any;
  customerAddress: string;
  vendor: { firm_name: string; gstin?: string; mobile?: string; email?: string; address?: string };
  bank: any | null;
  terms: Array<{ title: string; body: string }>;
  netCost: number;
  gstAmount: number;
  discount: number;
  total: number;
  schedule: ScheduleRow[];
}

export function renderQuotationHtml(input: QuotationHtmlInput): string {
  const {
    quotationNumber, quotationType, today, project, lead, customerAddress,
    vendor: v, bank: b, terms, netCost, gstAmount, discount, total, schedule,
  } = input;

  const termsHtml = terms.length
    ? terms
        .map(
          (t) =>
            `<div class="tc-block"><div class="tc-title">${esc(t.title)}</div><div class="tc-body">${esc(t.body).replace(/\n/g, "<br/>")}</div></div>`,
        )
        .join("")
    : `<div class="tc-block"><div class="tc-body">Standard terms apply.</div></div>`;

  const bankBlockHtml = b?.bank_name || b?.account_no
    ? `<div class="section">
          <div class="section-title">Bank Details</div>
          <table>
            ${b?.bank_name ? `<tr><td>Bank</td><td>${esc(b.bank_name)}</td></tr>` : ""}
            ${b?.holder_name ? `<tr><td>Account Holder</td><td>${esc(b.holder_name)}</td></tr>` : ""}
            ${b?.account_no ? `<tr><td>Account No.</td><td>${esc(b.account_no)}</td></tr>` : ""}
            ${b?.ifsc ? `<tr><td>IFSC</td><td>${esc(b.ifsc)}</td></tr>` : ""}
            ${b?.branch_name ? `<tr><td>Branch</td><td>${esc(b.branch_name)}</td></tr>` : ""}
          </table>
          ${b?.upi_image_url ? `<div style="margin-top:8px"><img src="${esc(b.upi_image_url)}" alt="UPI" style="max-height:160px;border:1px solid #e5e7eb;border-radius:6px"/></div>` : ""}
        </div>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${esc(quotationNumber)}</title><style>
  *{box-sizing:border-box}
  body{font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;margin:0;padding:32px;color:#1f2937;font-size:13px;line-height:1.45}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #f97316;padding-bottom:16px;margin-bottom:20px}
  .company{font-size:24px;font-weight:800;color:#f97316;letter-spacing:.3px}
  .sub{font-size:11px;color:#6b7280;margin-top:2px}
  .qt{text-align:right}
  .qt .num{font-weight:700;font-size:14px}
  .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;margin-top:4px}
  .badge.bank{background:#dbeafe;color:#1d4ed8}
  .badge.consumer{background:#fef3c7;color:#92400e}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}
  .card{border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;background:#fafafa}
  .card h4{margin:0 0 6px;font-size:12px;color:#f97316;text-transform:uppercase;letter-spacing:.5px}
  .section{margin-bottom:18px}
  .section-title{font-size:13px;font-weight:700;color:#111827;border-bottom:1px solid #e5e7eb;padding-bottom:4px;margin-bottom:10px}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  th,td{padding:7px 10px;text-align:left;border:1px solid #e5e7eb;font-size:12.5px}
  th{background:#fff7ed;font-weight:600;color:#9a3412}
  td.r,th.r{text-align:right}
  .total-row{background:#f97316;color:#fff;font-weight:700}
  .tc-block{margin-bottom:10px}
  .tc-title{font-weight:700;color:#111827;font-size:12.5px;margin-bottom:2px}
  .tc-body{font-size:12px;color:#374151;white-space:pre-line}
  .footer{margin-top:24px;font-size:11px;color:#6b7280;text-align:center;border-top:1px solid #e5e7eb;padding-top:10px}
  @media print{body{padding:18mm}}
</style></head>
<body>
  <div class="header">
    <div>
      <div class="company">${esc(v.firm_name)}</div>
      <div class="sub">Solar Energy Solutions${v.gstin ? ` • GSTIN: ${esc(v.gstin)}` : ""}</div>
      ${v.address ? `<div class="sub">${esc(v.address)}</div>` : ""}
      ${v.mobile ? `<div class="sub">Mob: ${esc(v.mobile)}${v.email ? ` • ${esc(v.email)}` : ""}</div>` : ""}
    </div>
    <div class="qt">
      <div class="num">Quotation No: ${esc(quotationNumber)}</div>
      <div class="sub">Date: ${today}</div>
      <div class="sub">Project: ${esc(project.project_code)}</div>
      ${project.k_number ? `<div class="sub">K Number: ${esc(project.k_number)}</div>` : ""}
      <div class="badge ${quotationType}">${quotationType === "bank" ? "BANK FINANCED" : "CONSUMER (CASH)"}</div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <h4>Quotation For</h4>
      <div style="font-weight:700">${esc(lead?.customer_name || "—")}</div>
      <div>${esc(customerAddress || "—")}</div>
      ${lead?.mobile ? `<div>Mobile: ${esc(lead.mobile)}</div>` : ""}
    </div>
    <div class="card">
      <h4>System</h4>
      <div><strong>${esc(project.capacity_kw)} kW</strong> ${esc(STRUCTURE_LABEL[project.structure_type] || project.structure_type)}</div>
      <div>Panels: ${esc(project.panel_brand)} ${esc(project.panel_watt)}W × ${esc(project.panel_qty)}</div>
      <div>Inverter: ${esc(project.inverter_brand)} ${esc(project.inverter_capacity)} kW</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Pricing Breakdown</div>
    <table>
      <tr><th>Description</th><th class="r">Amount (₹)</th></tr>
      <tr><td>System Cost (excl. GST)</td><td class="r">${netCost.toLocaleString("en-IN")}</td></tr>
      <tr><td>GST @ 8.9% (inclusive)</td><td class="r">${gstAmount.toLocaleString("en-IN")}</td></tr>
      ${discount > 0 ? `<tr><td>Discount</td><td class="r">-${discount.toLocaleString("en-IN")}</td></tr>` : ""}
      <tr class="total-row"><td>Grand Total (Incl. GST)</td><td class="r">₹${total.toLocaleString("en-IN")}</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Payment Schedule (${quotationType === "bank" ? "Bank Financed" : "Consumer / Cash"})</div>
    <table>
      <tr><th>Installment</th><th>Stage</th><th class="r">Amount (₹)</th></tr>
      ${schedule.map((s) => `<tr><td>${esc(s.label)}</td><td>${esc(s.stage)}</td><td class="r">${s.amount.toLocaleString("en-IN")}</td></tr>`).join("")}
    </table>
  </div>

  ${bankBlockHtml}

  <div class="section">
    <div class="section-title">Terms &amp; Conditions</div>
    ${termsHtml}
  </div>

  <div class="footer">
    <div><strong>${esc(v.firm_name)}</strong> — Brand: Mayukh Solar</div>
    <div>This is a computer-generated quotation.</div>
  </div>
</body></html>`;
}
