// Receives incoming WhatsApp messages and processes quotation CONFIRM/REJECT replies.
import { Router, raw } from "express";
import { admin } from "../supabase.js";

export const whatsappRouter = Router();

const CONFIRM_KEYWORDS = ["confirm", "yes", "accept", "ok", "हां", "हाँ", "ha", "han"];
const REJECT_KEYWORDS = ["reject", "no", "cancel", "decline", "नहीं", "nahi"];

/** Pulls a quotation number like MS-Q-123456-01 or QT-2025-001 out of a message. */
const extractQTNumber = (msg: string): string | null => {
  const match = msg.match(/(MS-Q-\d+(-\d+)?|QT-\d{4}-\d{3,})/i);
  return match ? match[0].toUpperCase() : null;
};

/** Normalizes any inbound phone format to a 10-digit Indian number. */
const cleanPhone = (rawPhone: string): string => {
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return digits.slice(-10);
};

/**
 * Extracts sender and message text from a provider payload.
 *
 * `body` may arrive as a Buffer (local Express with `raw()`), a string, or an
 * already-parsed object — Vercel parses request bodies before the Function sees
 * them, so the same route has to cope with both.
 *
 * Returns null when the payload carries no message (e.g. a Meta status event).
 */
export function parseInboundMessage(
  body: unknown,
  contentType: string,
  provider: string,
): { fromPhone: string; messageBody: string } | null {
  const isFormEncoded =
    provider === "twilio" || contentType.includes("application/x-www-form-urlencoded");

  // Normalize to either raw text or a parsed object, whichever we can get.
  const rawText =
    Buffer.isBuffer(body) ? body.toString("utf8") : typeof body === "string" ? body : null;

  if (isFormEncoded) {
    // Vercel hands form-encoded bodies over already parsed into an object.
    const params =
      rawText !== null
        ? new URLSearchParams(rawText)
        : new URLSearchParams(body as Record<string, string>);
    const fromPhone = (params.get("From") || "") // "whatsapp:+919876543210"
      .replace(/^whatsapp:/i, "")
      .replace("+", "");
    return { fromPhone, messageBody: params.get("Body") || "" };
  }

  const payload = rawText !== null ? JSON.parse(rawText) : (body as any);

  if (provider === "cloud_api" || payload?.object === "whatsapp_business_account") {
    const msg = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return null; // not a message event
    return {
      fromPhone: msg.from || "",
      messageBody:
        msg.interactive?.button_reply?.id ||
        msg.interactive?.button_reply?.title ||
        msg.text?.body ||
        msg.button?.text ||
        "",
    };
  }

  if (provider === "ultramsg" || payload?.data) {
    const fromPhone = (payload?.data?.from || "") // "919876543210@c.us"
      .split("@")[0]
      .replace("+", "");
    return { fromPhone, messageBody: payload?.data?.body || "" };
  }

  return {
    fromPhone: payload?.from || payload?.sender || "",
    messageBody: payload?.message || payload?.body || "",
  };
}

async function loadWhatsappConfig(): Promise<any> {
  const { data } = await admin
    .from("system_configs")
    .select("value")
    .eq("key", "whatsapp_config")
    .maybeSingle();
  return data?.value ?? {};
}

// ── GET: Meta Cloud API webhook verification challenge ──────────────────────
whatsappRouter.get("/whatsapp-webhook", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const webhookSecret = (await loadWhatsappConfig())?.webhook_secret || "";

  if (mode === "subscribe" && (token === webhookSecret || !webhookSecret)) {
    console.log("Meta webhook verification successful");
    return res.status(200).send(String(challenge ?? ""));
  }
  res.status(403).send("Verification failed");
});

// ── POST: Incoming message from the WhatsApp provider ───────────────────────
// `raw()` keeps the body unparsed locally, since providers send either JSON or
// form-encoded payloads. On Vercel the body arrives pre-parsed instead, which
// `parseInboundMessage` handles.
whatsappRouter.post(
  "/whatsapp-webhook",
  raw({ type: "*/*", limit: "1mb" }),
  async (req, res) => {
    try {
      const contentType = req.headers["content-type"] || "";
      console.log(
        "Incoming webhook payload:",
        Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body),
      );

      const provider = (await loadWhatsappConfig())?.provider || "ultramsg";

      const parsed = parseInboundMessage(req.body, contentType, provider);
      if (!parsed) {
        console.log("Payload carried no message");
        return res.status(200).send("OK");
      }
      const { fromPhone, messageBody } = parsed;

      if (!fromPhone || !messageBody) {
        console.log("No phone or message body found in payload");
        return res.status(200).send("OK");
      }

      const phone10 = cleanPhone(fromPhone);
      const msgLower = messageBody.toLowerCase().trim();
      const qtNumber = extractQTNumber(messageBody);

      console.log(`Processed: phone=${phone10}, body="${msgLower}", qtNumber=${qtNumber}`);

      const isConfirm = CONFIRM_KEYWORDS.some((kw) => msgLower.startsWith(kw));
      const isReject = REJECT_KEYWORDS.some((kw) => msgLower.startsWith(kw));
      if (!isConfirm && !isReject) {
        console.log("Message does not match any confirmation/rejection keyword");
        return res.status(200).send("OK");
      }

      const { data: leads } = await admin
        .from("leads")
        .select("id, status, quotation_details, customer_name")
        .or(`mobile.eq.${phone10},alt_mobile.eq.${phone10}`)
        .not("quotation_details", "is", null)
        .in("status", ["quotation_sent", "interested", "final"]);

      if (!leads || leads.length === 0) {
        console.log(`No matching lead found for phone: ${phone10}`);
        return res.status(200).send("OK");
      }

      // quotation_details is either a JSONB array of quotations or a single object.
      const findQuotation = (leadObj: any, qNum: string) => {
        const qd = leadObj.quotation_details;
        if (Array.isArray(qd)) return qd.find((q: any) => q?.quotation_number === qNum);
        if (qd && typeof qd === "object") return qd.quotation_number === qNum ? qd : null;
        return null;
      };

      let targetLead: any = leads[0];
      let matchedQuote: any = null;

      if (qtNumber) {
        const matched = leads.find((l: any) => findQuotation(l, qtNumber) != null);
        if (matched) {
          targetLead = matched;
          matchedQuote = findQuotation(targetLead, qtNumber);
        } else {
          console.log(`QT number ${qtNumber} not found in any leads for phone ${phone10}`);
          return res.status(200).send("OK");
        }
      } else {
        const qd = targetLead.quotation_details;
        if (Array.isArray(qd) && qd.length > 0) matchedQuote = qd[qd.length - 1]; // latest
        else if (qd && typeof qd === "object") matchedQuote = qd;
      }

      const newStatus = isConfirm ? "quotation_accepted" : "quotation_rejected";

      let updatedQuotationDetails = targetLead.quotation_details;
      if (matchedQuote) {
        matchedQuote.status = isConfirm ? "accepted" : "rejected";
        matchedQuote.updated_at = new Date().toISOString();
        if (Array.isArray(updatedQuotationDetails)) {
          updatedQuotationDetails = updatedQuotationDetails.map((q: any) =>
            q.quotation_number === matchedQuote.quotation_number ? matchedQuote : q,
          );
        } else if (updatedQuotationDetails && typeof updatedQuotationDetails === "object") {
          updatedQuotationDetails = matchedQuote;
        }
      }

      const { error: updateError } = await admin
        .from("leads")
        .update({
          status: newStatus,
          quotation_details: updatedQuotationDetails,
          quotation_response_at: new Date().toISOString(),
          quotation_response_message: messageBody.slice(0, 500),
        })
        .eq("id", targetLead.id);

      if (updateError) {
        console.error("Error updating lead:", updateError);
        return res.status(500).send("Internal error");
      }

      // user_id null marks this as a system/automated action.
      await admin.from("audit_logs").insert({
        action: newStatus,
        entity_type: "lead",
        entity_id: targetLead.id,
        user_id: null,
        new_value: {
          message: messageBody,
          phone: phone10,
          qt_number: matchedQuote?.quotation_number || qtNumber,
          qt_name: matchedQuote?.name || null,
        },
      });

      console.log(`✅ Lead ${targetLead.id} status updated to ${newStatus}`);
      res.status(200).send("OK");
    } catch (err) {
      console.error("Webhook error:", err);
      // Always 200 so the provider doesn't retry a payload we can't parse.
      res.status(200).send("OK");
    }
  },
);
