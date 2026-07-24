// supabase/functions/whatsapp-webhook/index.ts
// Receives incoming WhatsApp messages and processes quotation CONFIRM/REJECT replies

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-requested-with, content-type',
};

// Positive confirmation keywords (case-insensitive)
const CONFIRM_KEYWORDS = ['confirm', 'yes', 'accept', 'ok', 'हां', 'हाँ', 'ha', 'han'];
// Rejection keywords
const REJECT_KEYWORDS = ['reject', 'no', 'cancel', 'decline', 'नहीं', 'nahi'];

// Extract a quotation number like MS-Q-123456-01 or QT-2025-001 from message
const extractQTNumber = (msg: string): string | null => {
  const match = msg.match(/(MS-Q-\d+(-\d+)?|QT-\d{4}-\d{3,})/i);
  return match ? match[0].toUpperCase() : null;
};

// Clean phone to 10-digit Indian format
const cleanPhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 10) return digits;
  return digits.slice(-10); // fallback: take last 10 digits
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // ── GET: Meta Cloud API webhook verification challenge ──────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    // Fetch webhook_secret from config
    const { data: configRow } = await supabase
      .from('system_configs')
      .select('value')
      .eq('key', 'whatsapp_config')
      .maybeSingle();

    const webhookSecret = (configRow?.value as any)?.webhook_secret || '';

    if (mode === 'subscribe' && (token === webhookSecret || !webhookSecret)) {
      console.log('Meta webhook verification successful');
      return new Response(challenge, { status: 200 });
    }
    return new Response('Verification failed', { status: 403 });
  }

  // ── POST: Incoming message from WhatsApp provider ───────────────────────────
  if (req.method === 'POST') {
    try {
      const contentType = req.headers.get('content-type') || '';
      let fromPhone = '';
      let messageBody = '';

      // Read body
      const rawBody = await req.text();
      console.log('Incoming webhook payload:', rawBody);

      // Fetch provider config
      const { data: configRow } = await supabase
        .from('system_configs')
        .select('value')
        .eq('key', 'whatsapp_config')
        .maybeSingle();

      const provider = (configRow?.value as any)?.provider || 'ultramsg';

      // Parse payload based on provider
      if (provider === 'twilio' || contentType.includes('application/x-www-form-urlencoded')) {
        // Twilio sends form-encoded
        const params = new URLSearchParams(rawBody);
        fromPhone = params.get('From') || '';
        messageBody = params.get('Body') || '';
        // Twilio format: "whatsapp:+919876543210"
        fromPhone = fromPhone.replace(/^whatsapp:/i, '').replace('+', '');
      } else {
        // JSON providers: UltraMsg, Meta Cloud API, custom
        const payload = JSON.parse(rawBody);

        if (provider === 'cloud_api' || payload?.object === 'whatsapp_business_account') {
          // Meta Cloud API format
          const entry = payload?.entry?.[0];
          const change = entry?.changes?.[0];
          const msg = change?.value?.messages?.[0];
          if (!msg) {
            return new Response('OK', { status: 200 }); // not a message event
          }
          fromPhone = msg.from || '';
          messageBody = msg.interactive?.button_reply?.id || msg.interactive?.button_reply?.title || msg.text?.body || msg.button?.text || '';
        } else if (provider === 'ultramsg' || payload?.data) {
          // UltraMsg format
          fromPhone = payload?.data?.from || '';
          messageBody = payload?.data?.body || '';
          // UltraMsg format: "919876543210@c.us" or "+919876543210"
          fromPhone = fromPhone.split('@')[0].replace('+', '');
        } else {
          // Custom gateway format
          fromPhone = payload?.from || payload?.sender || '';
          messageBody = payload?.message || payload?.body || '';
        }
      }

      if (!fromPhone || !messageBody) {
        console.log('No phone or message body found in payload');
        return new Response('OK', { status: 200 });
      }

      const phone10 = cleanPhone(fromPhone);
      const msgLower = messageBody.toLowerCase().trim();
      const qtNumber = extractQTNumber(messageBody);

      console.log(`Processed: phone=${phone10}, body="${msgLower}", qtNumber=${qtNumber}`);

      // Detect intent
      const isConfirm = CONFIRM_KEYWORDS.some(kw => msgLower.startsWith(kw));
      const isReject = REJECT_KEYWORDS.some(kw => msgLower.startsWith(kw));

      if (!isConfirm && !isReject) {
        console.log('Message does not match any confirmation/rejection keyword');
        return new Response('OK', { status: 200 });
      }

      // Find matching lead by phone number
      let leadQuery = supabase
        .from('leads')
        .select('id, status, quotation_details, customer_name')
        .or(`mobile.eq.${phone10},alt_mobile.eq.${phone10}`)
        .not('quotation_details', 'is', null)
        .in('status', ['quotation_sent', 'interested', 'final']);

      const { data: leads } = await leadQuery;

      if (!leads || leads.length === 0) {
        console.log(`No matching lead found for phone: ${phone10}`);
        return new Response('OK', { status: 200 });
      }

      // Find specific quotation matching the number (can be in a JSONB array or single object)
      let targetLead = leads[0];
      let matchedQuote: any = null;

      const findQuotation = (leadObj: any, qNum: string) => {
        const qd = leadObj.quotation_details;
        if (Array.isArray(qd)) {
          return qd.find((q: any) => q?.quotation_number === qNum);
        } else if (qd && typeof qd === 'object') {
          return (qd as any).quotation_number === qNum ? qd : null;
        }
        return null;
      };

      if (qtNumber) {
        const matched = leads.find((l: any) => findQuotation(l, qtNumber) !== null);
        if (matched) {
          targetLead = matched;
          matchedQuote = findQuotation(targetLead, qtNumber);
        } else {
          matchedQuote = findQuotation(targetLead, qtNumber);
          if (!matchedQuote) {
            console.log(`QT number ${qtNumber} not found in any leads for phone ${phone10}`);
            return new Response('OK', { status: 200 });
          }
        }
      } else {
        const qd = targetLead.quotation_details;
        if (Array.isArray(qd) && qd.length > 0) {
          matchedQuote = qd[qd.length - 1]; // default to latest
        } else if (qd && typeof qd === 'object') {
          matchedQuote = qd;
        }
      }

      const newStatus = isConfirm ? 'quotation_accepted' : 'quotation_rejected';
      const auditAction = isConfirm ? 'quotation_accepted' : 'quotation_rejected';

      let updatedQuotationDetails = targetLead.quotation_details;
      if (matchedQuote) {
        matchedQuote.status = isConfirm ? 'accepted' : 'rejected';
        matchedQuote.updated_at = new Date().toISOString();
        if (Array.isArray(updatedQuotationDetails)) {
          updatedQuotationDetails = updatedQuotationDetails.map((q: any) =>
            q.quotation_number === matchedQuote.quotation_number ? matchedQuote : q
          );
        } else if (updatedQuotationDetails && typeof updatedQuotationDetails === 'object') {
          updatedQuotationDetails = matchedQuote;
        }
      }

      // Update lead status and response tracking
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          status: newStatus,
          quotation_details: updatedQuotationDetails,
          quotation_response_at: new Date().toISOString(),
          quotation_response_message: messageBody.slice(0, 500),
        })
        .eq('id', targetLead.id);

      if (updateError) {
        console.error('Error updating lead:', updateError);
        return new Response('Internal error', { status: 500 });
      }

      // Log to audit_logs (user_id is null = system/automated action)
      await supabase.from('audit_logs').insert({
        action: auditAction,
        entity_type: 'lead',
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
      return new Response('OK', { status: 200 });

    } catch (err) {
      console.error('Webhook error:', err);
      // Always return 200 to prevent provider retries for parse errors
      return new Response('OK', { status: 200 });
    }
  }

  return new Response('Method not allowed', { status: 405 });
});
