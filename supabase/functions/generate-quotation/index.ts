const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { projectId } = await req.json();
    if (!projectId) {
      return new Response(JSON.stringify({ error: "projectId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get auth user from JWT
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader) {
      const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await supabaseAuth.auth.getUser();
      userId = user?.id ?? null;
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("*, leads(customer_name, mobile, address, village_city, district, state)")
      .eq("id", projectId)
      .single();

    if (pErr || !project) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lead = project.leads;
    const baseAmount = Number(project.final_amount);
    const discount = Number(project.discount || 0);
    const subtotal = baseAmount - discount;
    const total = subtotal;
    const inst1 = Math.round(total * 0.3);
    const inst2 = Math.round(total * 0.6);
    const inst3 = total - inst1 - inst2;
    const today = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const structureLabel: Record<string, string> = {
      rcc_roof: "RCC Roof",
      tin_shed_roof: "Tin Shed Roof",
      ground_mount: "Ground Mount",
    };

    // Generate quotation number and save record
    const { data: qtNumData } = await supabase.rpc("generate_quotation_number");
    const quotationNumber = qtNumData || `MS-QT-${new Date().getFullYear()}-0001`;

    const customerAddress = [lead?.address, lead?.village_city, lead?.district, lead?.state]
      .filter(Boolean)
      .join(", ");

    const { error: insertErr } = await supabase
      .from("quotations")
      .insert({
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

    if (insertErr) {
      console.error("Failed to save quotation record:", insertErr);
    }

    // Generate HTML quotation with quotation number
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 40px; color: #333; }
  .header { text-align: center; border-bottom: 3px solid #f97316; padding-bottom: 20px; margin-bottom: 30px; }
  .company { font-size: 28px; font-weight: bold; color: #f97316; }
  .subtitle { font-size: 12px; color: #666; margin-top: 4px; }
  .qt-number { font-size: 16px; font-weight: bold; color: #333; margin-top: 8px; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 14px; font-weight: bold; color: #f97316; border-bottom: 1px solid #eee; padding-bottom: 4px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { padding: 8px 12px; text-align: left; border: 1px solid #ddd; font-size: 13px; }
  th { background: #fff7ed; font-weight: 600; }
  .total-row { background: #f97316; color: white; font-weight: bold; }
  .footer { text-align: center; margin-top: 40px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 16px; }
  .terms { font-size: 11px; color: #666; }
  .terms li { margin-bottom: 4px; }
</style></head>
<body>
  <div class="header">
    <div class="company">V R ENTERPRISES</div>
    <div class="subtitle">Solar Energy Solutions | GST: XXXXXXXXXX</div>
    <div class="subtitle">Brand: Mayukh Solar</div>
    <div class="qt-number">Quotation No: ${quotationNumber}</div>
  </div>

  <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
    <div>
      <strong>Quotation For:</strong><br>
      ${lead?.customer_name || "—"}<br>
      ${lead?.address || ""}, ${lead?.village_city || ""}<br>
      ${lead?.district || ""}, ${lead?.state || ""}<br>
      Mobile: ${lead?.mobile || "—"}
    </div>
    <div style="text-align: right;">
      <strong>Quotation No:</strong> ${quotationNumber}<br>
      <strong>Project Code:</strong> ${project.project_code}<br>
      <strong>K Number:</strong> ${project.k_number || "—"}<br>
      <strong>Date:</strong> ${today}
    </div>
  </div>

  <div class="section">
    <div class="section-title">System Specifications</div>
    <table>
      <tr><th>Component</th><th>Details</th></tr>
      <tr><td>System Capacity</td><td>${project.capacity_kw} kW</td></tr>
      <tr><td>Solar Panels</td><td>${project.panel_brand} — ${project.panel_watt}W × ${project.panel_qty} nos</td></tr>
      <tr><td>Inverter</td><td>${project.inverter_brand} — ${project.inverter_capacity} kW</td></tr>
      <tr><td>Structure Type</td><td>${structureLabel[project.structure_type] || project.structure_type}</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Pricing Breakdown</div>
    <table>
      <tr><th>Description</th><th style="text-align:right;">Amount (₹)</th></tr>
      <tr><td>System Cost</td><td style="text-align:right;">${baseAmount.toLocaleString("en-IN")}</td></tr>
      ${discount > 0 ? `<tr><td>Discount</td><td style="text-align:right;">-${discount.toLocaleString("en-IN")}</td></tr>` : ""}
      <tr><td>Subtotal</td><td style="text-align:right;">${subtotal.toLocaleString("en-IN")}</td></tr>
      <tr><td>GST</td><td style="text-align:right;">Included / Paid</td></tr>
      <tr class="total-row"><td>Grand Total</td><td style="text-align:right;">₹${total.toLocaleString("en-IN")}</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Payment Schedule (${project.payment_type === "loan" ? "Loan" : "Cash"})</div>
    <table>
      <tr><th>Installment</th><th>Stage</th><th style="text-align:right;">Amount (₹)</th></tr>
      <tr><td>1st (30%)</td><td>At Order Confirmation</td><td style="text-align:right;">${inst1.toLocaleString("en-IN")}</td></tr>
      <tr><td>2nd (60%)</td><td>After Structure Completion</td><td style="text-align:right;">${inst2.toLocaleString("en-IN")}</td></tr>
      <tr><td>3rd (10%)</td><td>After Generation Begins</td><td style="text-align:right;">${inst3.toLocaleString("en-IN")}</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Terms & Conditions</div>
    <ul class="terms">
      <li>This quotation is valid for 15 days from the date of issue.</li>
      <li>Prices are subject to change based on market conditions.</li>
      <li>Installation timeline: within 30 days of order confirmation and document submission.</li>
      <li>Warranty as per manufacturer terms.</li>
      <li>Net metering assistance provided by V R Enterprises.</li>
    </ul>
  </div>

  <div class="footer">
    <p><strong>V R ENTERPRISES</strong> — Mayukh Solar</p>
    <p>This is a computer-generated quotation.</p>
  </div>
</body></html>`;

    return new Response(JSON.stringify({ 
      html, 
      project_code: project.project_code,
      quotation_number: quotationNumber 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate quotation";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
