// Generate quotation HTML using DB-driven T&C templates, default vendor profile,
// and a selectable Bank vs Consumer payment schedule with optional bank account.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const body = await req.json();
    const quotationId: string | undefined = body?.quotationId;
    const mode: "view" | "generate" = quotationId ? "view" : (body?.mode === "view" ? "view" : "generate");
    let projectId: string | undefined = body?.projectId;
    let quotationType: "bank" | "consumer" = body?.quotationType === "bank" ? "bank" : "consumer";
    let bankAccountId: string | null = body?.bankAccountId || null;

    if (!projectId && !quotationId) {
      return new Response(JSON.stringify({ error: "projectId or quotationId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sbAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sbAuth.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId: string = user.id;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // VIEW MODE: load existing quotation, reuse its stored snapshot, do NOT insert.
    let existingQuotation: any = null;
    if (quotationId) {
      const { data: qRow, error: qErr } = await supabase
        .from("quotations").select("*").eq("id", quotationId).maybeSingle();
      if (qErr || !qRow) {
        return new Response(JSON.stringify({ error: "Quotation not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      existingQuotation = qRow;
      projectId = qRow.project_id;
      quotationType = (qRow.quotation_type === "bank" ? "bank" : "consumer");
      bankAccountId = qRow.bank_account_id || null;
    }

    const [{ data: project, error: pErr }, { data: vendor }, { data: terms }, { data: bank }] =
      await Promise.all([
        supabase
          .from("projects")
          .select("*, leads(customer_name, mobile, address, village_city, district, state)")
          .eq("id", projectId)
          .single(),
        supabase.from("vendor_profiles").select("*").eq("is_default", true).maybeSingle(),
        supabase
          .from("quotation_terms_templates")
          .select("title, body, section_order")
          .eq("is_active", true)
          .order("section_order", { ascending: true }),
        bankAccountId
          ? supabase.from("vendor_bank_accounts").select("*").eq("id", bankAccountId).maybeSingle()
          : supabase.from("vendor_bank_accounts").select("*").eq("is_default", true).eq("is_active", true).maybeSingle(),
      ]);

    if (pErr || !project) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lead = project.leads;
    // For view mode, use stored total; for generate, compute from project.
    const storedTotal = existingQuotation ? Number(existingQuotation.total_amount) : null;
    const baseAmount = storedTotal ?? Number(project.final_amount);
    const discount = existingQuotation ? 0 : Number(project.discount || 0);
    const subtotal = existingQuotation ? baseAmount : (baseAmount - discount);
    const gstAmount = Math.round((subtotal * 8.9) / 108.9);
    const netCost = subtotal - gstAmount;
    const total = subtotal;

    // Payment schedule: reuse stored when viewing, otherwise compute fresh.
    let schedule: Array<{ label: string; stage: string; amount: number }>;
    if (existingQuotation?.payment_schedule && Array.isArray(existingQuotation.payment_schedule) && existingQuotation.payment_schedule.length > 0) {
      schedule = existingQuotation.payment_schedule as any;
    } else if (quotationType === "bank") {
      schedule = [{ label: "100% Advance", stage: "At Order Confirmation (Bank Disbursement)", amount: total }];
    } else {
      const inst1 = Math.round(total * 0.3);
      const inst2 = Math.round(total * 0.6);
      const inst3 = total - inst1 - inst2;
      schedule = [
        { label: "1st (30% Advance)", stage: "At Order Confirmation", amount: inst1 },
        { label: "2nd (60% Mid Payment)", stage: "After Structure Completion", amount: inst2 },
        { label: "3rd (10% Final)", stage: "After Generation Begins", amount: inst3 },
      ];
    }

    const dateSource = existingQuotation ? new Date(existingQuotation.created_at) : new Date();
    const today = dateSource.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const structureLabel: Record<string, string> = {
      rcc_roof: "RCC Roof",
      tin_shed_roof: "Tin Shed Roof",
      ground_mount: "Ground Mount",
    };

    let quotationNumber: string;
    if (existingQuotation) {
      quotationNumber = existingQuotation.quotation_number;
    } else {
      const { data: qtNumData } = await supabase.rpc("generate_quotation_number");
      quotationNumber = qtNumData || `MS-QT-${new Date().getFullYear()}-0001`;
    }

    const customerAddress = [lead?.address, lead?.village_city, lead?.district, lead?.state].filter(Boolean).join(", ");

    // INSERT only in generate mode — viewing must never create a new row.
    if (!existingQuotation) {
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
        quotation_type: quotationType,
        bank_account_id: bank?.id || null,
        payment_schedule: schedule,
      });
      if (insertErr) console.error("Failed to save quotation record:", insertErr);
    }


    const v = vendor || {
      firm_name: "V R ENTERPRISES", gstin: "", mobile: "", email: "", address: "",
    };

    const termsHtml = (terms ?? []).length
      ? (terms ?? [])
          .map(
            (t: any) =>
              `<div class="tc-block"><div class="tc-title">${esc(t.title)}</div><div class="tc-body">${esc(t.body).replace(/\n/g, "<br/>")}</div></div>`,
          )
          .join("")
      : `<div class="tc-block"><div class="tc-body">Standard terms apply.</div></div>`;

    // Bank block: prefer selected vendor_bank_account; fall back to vendor_profile bank fields
    const b: any = bank || {
      bank_name: (vendor as any)?.bank_name,
      holder_name: null,
      account_no: (vendor as any)?.account_no,
      ifsc: (vendor as any)?.ifsc,
      branch_name: null,
      upi_image_url: null,
    };

    const bankBlockHtml = (b.bank_name || b.account_no)
      ? `<div class="section">
          <div class="section-title">Bank Details</div>
          <table>
            ${b.bank_name ? `<tr><td>Bank</td><td>${esc(b.bank_name)}</td></tr>` : ""}
            ${b.holder_name ? `<tr><td>Account Holder</td><td>${esc(b.holder_name)}</td></tr>` : ""}
            ${b.account_no ? `<tr><td>Account No.</td><td>${esc(b.account_no)}</td></tr>` : ""}
            ${b.ifsc ? `<tr><td>IFSC</td><td>${esc(b.ifsc)}</td></tr>` : ""}
            ${b.branch_name ? `<tr><td>Branch</td><td>${esc(b.branch_name)}</td></tr>` : ""}
          </table>
          ${b.upi_image_url ? `<div style="margin-top:8px"><img src="${esc(b.upi_image_url)}" alt="UPI" style="max-height:160px;border:1px solid #e5e7eb;border-radius:6px"/></div>` : ""}
        </div>`
      : "";

    const html = `<!DOCTYPE html>
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
    <div class="section-title">Payment Schedule (${quotationType === "bank" ? "Bank Financed" : "Consumer / Cash"})</div>
    <table>
      <tr><th>Installment</th><th>Stage</th><th class="r">Amount (₹)</th></tr>
      ${schedule.map(s => `<tr><td>${esc(s.label)}</td><td>${esc(s.stage)}</td><td class="r">${s.amount.toLocaleString("en-IN")}</td></tr>`).join("")}
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

    return new Response(
      JSON.stringify({
        html,
        project_code: project.project_code,
        quotation_number: quotationNumber,
        quotation_type: quotationType,
        bank_account_id: bank?.id || null,
        payment_schedule: schedule,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate quotation";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
