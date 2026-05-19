// Generate quotation HTML using DB-driven T&C templates + default vendor profile.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { projectId } = await req.json();
    if (!projectId) {
      return new Response(JSON.stringify({ error: "projectId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader) {
      const sbAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await sbAuth.auth.getUser();
      userId = user?.id ?? null;
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const [{ data: project, error: pErr }, { data: vendor }, { data: terms }] = await Promise.all([
      supabase.from("projects").select("*, leads(customer_name, mobile, address, village_city, district, state)").eq("id", projectId).single(),
      supabase.from("vendor_profiles").select("*").eq("is_default", true).maybeSingle(),
      supabase.from("quotation_terms_templates").select("title, body, section_order").eq("is_active", true).order("section_order", { ascending: true }),
    ]);

    if (pErr || !project) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lead = project.leads;
    const baseAmount = Number(project.final_amount);
    const discount = Number(project.discount || 0);
    const subtotal = baseAmount - discount;
    // GST 18% computed by extracting from inclusive total
    const gstAmount = Math.round((subtotal * 18) / 118);
    const netCost = subtotal - gstAmount;
    const total = subtotal;
    const inst1 = Math.round(total * 0.3);
    const inst2 = Math.round(total * 0.6);
    const inst3 = total - inst1 - inst2;
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

    const structureLabel: Record<string, string> = {
      rcc_roof: "RCC Roof", tin_shed_roof: "Tin Shed Roof", ground_mount: "Ground Mount",
    };

    const { data: qtNumData } = await supabase.rpc("generate_quotation_number");
    const quotationNumber = qtNumData || `MS-QT-${new Date().getFullYear()}-0001`;

    const customerAddress = [lead?.address, lead?.village_city, lead?.district, lead?.state].filter(Boolean).join(", ");

    const { error: insertErr } = await supabase.from("quotations").insert({
      quotation_number: quotationNumber,
      project_id: projectId,
      project_code: project.project_code,
      customer_name: lead?.customer_name || "Unknown",
      customer_mobile: lead?.mobile || null,
      customer_address: customerAddress || null,
      capacity_kw: project.capacity_kw,
      total_amount: total,
      created_by_user_id: userId || project.created_by_user_id,
    });
    if (insertErr) console.error("Failed to save quotation record:", insertErr);

    const v = vendor || {
      firm_name: "V R ENTERPRISES",
      gstin: "", mobile: "", email: "", address: "",
      bank_name: "", account_no: "", ifsc: "", account_type: "",
    };

    const termsHtml = (terms ?? []).length
      ? (terms ?? []).map((t: any) => `<div class="tc-block"><div class="tc-title">${esc(t.title)}</div><div class="tc-body">${esc(t.body).replace(/\n/g, "<br/>")}</div></div>`).join("")
      : `<div class="tc-block"><div class="tc-body">Standard terms apply.</div></div>`;

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${esc(quotationNumber)}</title><style>
  *{box-sizing:border-box}
  body{font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;margin:0;padding:32px;color:#1f2937;font-size:13px;line-height:1.45}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #f97316;padding-bottom:16px;margin-bottom:20px}
  .company{font-size:24px;font-weight:800;color:#f97316;letter-spacing:.3px}
  .sub{font-size:11px;color:#6b7280;margin-top:2px}
  .qt{text-align:right}
  .qt .num{font-weight:700;font-size:14px}
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
      <div><strong>${esc(project.capacity_kw)} kW</strong> ${esc(structureLabel[project.structure_type] || project.structure_type)}</div>
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
    <div class="section-title">Payment Schedule (${project.payment_type === "loan" ? "Loan" : "Cash"})</div>
    <table>
      <tr><th>Installment</th><th>Stage</th><th class="r">Amount (₹)</th></tr>
      <tr><td>1st (30%)</td><td>At Order Confirmation</td><td class="r">${inst1.toLocaleString("en-IN")}</td></tr>
      <tr><td>2nd (60%)</td><td>After Structure Completion</td><td class="r">${inst2.toLocaleString("en-IN")}</td></tr>
      <tr><td>3rd (10%)</td><td>After Generation Begins</td><td class="r">${inst3.toLocaleString("en-IN")}</td></tr>
    </table>
  </div>

  ${v.bank_name || v.account_no ? `
  <div class="section">
    <div class="section-title">Bank Details</div>
    <table>
      ${v.bank_name ? `<tr><td>Bank</td><td>${esc(v.bank_name)}</td></tr>` : ""}
      ${v.account_no ? `<tr><td>Account No.</td><td>${esc(v.account_no)}</td></tr>` : ""}
      ${v.ifsc ? `<tr><td>IFSC</td><td>${esc(v.ifsc)}</td></tr>` : ""}
      ${v.account_type ? `<tr><td>Type</td><td>${esc(v.account_type)}</td></tr>` : ""}
    </table>
  </div>` : ""}

  <div class="section">
    <div class="section-title">Terms &amp; Conditions</div>
    ${termsHtml}
  </div>

  <div class="footer">
    <div><strong>${esc(v.firm_name)}</strong> — Brand: Mayukh Solar</div>
    <div>This is a computer-generated quotation.</div>
  </div>
</body></html>`;

    return new Response(JSON.stringify({ html, project_code: project.project_code, quotation_number: quotationNumber }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate quotation";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
