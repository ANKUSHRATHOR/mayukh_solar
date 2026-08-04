import { Router } from "express";
import { HttpError, asyncHandler } from "../http.js";
import { requireAuth } from "../middleware/auth.js";
import { admin, hasRole } from "../supabase.js";
import { renderQuotationHtml, type ScheduleRow } from "../lib/quotationHtml.js";

export const quotationsRouter = Router();

/**
 * Generates quotation HTML from DB-driven T&C templates, the default vendor
 * profile, and a bank-vs-consumer payment schedule.
 *
 * Two modes: passing `quotationId` re-renders a stored quotation (never inserts),
 * passing `projectId` generates a new one and saves the row.
 */
quotationsRouter.post(
  "/generate-quotation",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const body = req.body ?? {};
    const quotationId: string | undefined = body.quotationId;
    let projectId: string | undefined = body.projectId;
    let quotationType: "bank" | "consumer" = body.quotationType === "bank" ? "bank" : "consumer";
    let bankAccountId: string | null = body.bankAccountId || null;

    if (!projectId && !quotationId) {
      throw new HttpError(400, "projectId or quotationId required");
    }

    const [isAdmin, isOperator, isSales] = await Promise.all([
      hasRole(userId, "admin"),
      hasRole(userId, "operator"),
      hasRole(userId, "sales_person"),
    ]);
    if (!isAdmin && !isOperator && !isSales) throw new HttpError(403, "Forbidden");

    // View mode: load the stored quotation and reuse its snapshot.
    let existingQuotation: any = null;
    if (quotationId) {
      const { data: qRow, error: qErr } = await admin
        .from("quotations")
        .select("*")
        .eq("id", quotationId)
        .maybeSingle();
      if (qErr || !qRow) throw new HttpError(404, "Quotation not found");

      existingQuotation = qRow;
      projectId = qRow.project_id;
      quotationType = qRow.quotation_type === "bank" ? "bank" : "consumer";
      bankAccountId = qRow.bank_account_id || null;
    }

    const [{ data: project, error: pErr }, { data: vendor }, { data: terms }, { data: bank }] =
      await Promise.all([
        admin
          .from("projects")
          .select("*, leads(customer_name, mobile, address, village_city, district, state)")
          .eq("id", projectId)
          .single(),
        admin
          .from("vendor_profiles")
          .select("firm_name, gstin, mobile, email, address")
          .eq("is_default", true)
          .maybeSingle(),
        admin
          .from("quotation_terms_templates")
          .select("title, body, section_order")
          .eq("is_active", true)
          .order("section_order", { ascending: true }),
        bankAccountId
          ? admin.from("vendor_bank_accounts").select("*").eq("id", bankAccountId).maybeSingle()
          : admin
              .from("vendor_bank_accounts")
              .select("*")
              .eq("is_default", true)
              .eq("is_active", true)
              .maybeSingle(),
      ]);

    if (pErr || !project) throw new HttpError(404, "Project not found");

    // Sales persons only reach projects they're assigned to.
    if (!isAdmin && !isOperator && isSales && project.assigned_sales_person_id !== userId) {
      throw new HttpError(403, "Forbidden");
    }

    const lead = project.leads;
    const storedTotal = existingQuotation ? Number(existingQuotation.total_amount) : null;
    const baseAmount = storedTotal ?? Number(project.final_amount);
    const discount = existingQuotation ? 0 : Number(project.discount || 0);
    const subtotal = existingQuotation ? baseAmount : baseAmount - discount;
    const gstAmount = Math.round((subtotal * 8.9) / 108.9);
    const netCost = subtotal - gstAmount;
    const total = subtotal;

    let schedule: ScheduleRow[];
    if (
      Array.isArray(existingQuotation?.payment_schedule) &&
      existingQuotation.payment_schedule.length > 0
    ) {
      schedule = existingQuotation.payment_schedule as ScheduleRow[];
    } else if (quotationType === "bank") {
      schedule = [
        { label: "100% Advance", stage: "At Order Confirmation (Bank Disbursement)", amount: total },
      ];
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
    const today = dateSource.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    let quotationNumber: string;
    if (existingQuotation) {
      quotationNumber = existingQuotation.quotation_number;
    } else {
      const { data: qtNumData } = await admin.rpc("generate_quotation_number");
      quotationNumber = qtNumData || `MS-QT-${new Date().getFullYear()}-0001`;
    }

    const customerAddress = [lead?.address, lead?.village_city, lead?.district, lead?.state]
      .filter(Boolean)
      .join(", ");

    // Insert only in generate mode — viewing must never create a row.
    if (!existingQuotation) {
      const { error: insertErr } = await admin.from("quotations").insert({
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

    const html = renderQuotationHtml({
      quotationNumber,
      quotationType,
      today,
      project,
      lead,
      customerAddress,
      vendor: vendor || { firm_name: "V R ENTERPRISES", gstin: "", mobile: "", email: "", address: "" },
      bank: bank || null,
      terms: (terms ?? []) as Array<{ title: string; body: string }>,
      netCost,
      gstAmount,
      discount,
      total,
      schedule,
    });

    res.json({
      html,
      project_code: project.project_code,
      quotation_number: quotationNumber,
      quotation_type: quotationType,
      bank_account_id: bank?.id || null,
      payment_schedule: schedule,
    });
  }),
);
