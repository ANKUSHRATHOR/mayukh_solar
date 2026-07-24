import { fetchSystemConfig } from '@/lib/systemConfig';

export interface WhatsAppSendOptions {
  phone: string;
  message: string;
  documentUrl?: string;
  filename?: string;
  buttons?: { id: string; title: string }[];
  contentSid?: string;
  contentVariables?: Record<string, string>;
}

/**
 * Core utility to send a WhatsApp message (text or document attachment) using configured provider settings
 */
export const sendWhatsAppMessage = async ({ phone, message, documentUrl, filename, buttons, contentSid, contentVariables }: WhatsAppSendOptions): Promise<{ success: boolean; error?: string }> => {
  try {
    // 1. Fetch config from system_configs
    const config = await fetchSystemConfig<any>('whatsapp_config');

    if (!config) {
      console.log('WhatsApp config not found in database.');
      return { success: false, error: 'WhatsApp config not found in settings' };
    }

    if (!config.enabled) {
      console.log('WhatsApp notifications are disabled in settings.');
      return { success: false, error: 'WhatsApp notifications are disabled in settings.' };
    }

    const cleanPhone = String(phone || '').replace(/[^\d]/g, '');
    // Ensure phone has country code (e.g. 91 for India)
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    const { provider, api_url, instance_id, access_token, sender_phone } = config;

    // A. UltraMsg
    if (provider === 'ultramsg') {
      const isButtons = buttons && buttons.length > 0;
      const isDoc = !!documentUrl;
      
      let endpoint = 'messages/chat';
      if (isButtons) {
        endpoint = 'messages/buttons';
      } else if (isDoc) {
        endpoint = 'messages/document';
      }
      
      const url = api_url ? (api_url.endsWith('/') ? `${api_url}${endpoint}` : `${api_url}/${endpoint}`) : `https://api.ultramsg.com/${instance_id}/${endpoint}`;
      
      const bodyParams = new URLSearchParams();
      bodyParams.append('token', access_token);
      bodyParams.append('to', `+${formattedPhone}`);
      
      if (isButtons) {
        bodyParams.append('body', message);
        buttons!.forEach((btn, idx) => {
          bodyParams.append(`buttonId${idx + 1}`, btn.id);
          bodyParams.append(`buttonText${idx + 1}`, btn.title);
        });
      } else if (isDoc) {
        bodyParams.append('document', documentUrl!);
        bodyParams.append('filename', filename || 'Document.pdf');
        bodyParams.append('caption', message);
      } else {
        bodyParams.append('body', message);
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString(),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`UltraMsg returned status ${res.status}: ${errText}`);
      }
      return { success: true };
    }

    // B. Twilio
    if (provider === 'twilio') {
      const url = api_url || `https://api.twilio.com/2010-04-01/Accounts/${instance_id}/Messages.json`;
      const authHeader = 'Basic ' + btoa(`${instance_id}:${access_token}`);
      const activeContentSid = contentSid || (buttons && buttons.length > 0 ? 'HXb5b62575e6e4ff6129ad7c8efe1f983e' : undefined);

      if (activeContentSid) {
        // 1. Send PDF Document file first (if documentUrl is provided)
        if (documentUrl) {
          const docBodyParams = new URLSearchParams();
          docBodyParams.append('From', `whatsapp:${sender_phone}`);
          docBodyParams.append('To', `whatsapp:+${formattedPhone}`);
          docBodyParams.append('Body', `Dear ${message.match(/^Dear ([^,\n]+)/)?.[1] || 'Customer'},\n\nPlease find the detailed quotation PDF attached below.`);
          docBodyParams.append('MediaUrl', documentUrl);
          
          await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: docBodyParams.toString(),
          });
        }

        // 2. Send the button template message
        const bodyParams = new URLSearchParams();
        bodyParams.append('From', `whatsapp:${sender_phone}`);
        bodyParams.append('To', `whatsapp:+${formattedPhone}`);
        bodyParams.append('ContentSid', activeContentSid);
        
        let vars = contentVariables;
        if (!vars && buttons && buttons.length > 0) {
          const qNoMatch = message.match(/MS-Q-\d+(-\d+)?/);
          const qNo = qNoMatch ? qNoMatch[0] : 'Quote';
          const priceMatch = message.match(/₹[\d,]+/);
          const priceVal = priceMatch ? priceMatch[0] : 'Assessment';
          vars = {
            "1": qNo,
            "2": priceVal
          };
        }
        
        if (vars) {
          bodyParams.append('ContentVariables', JSON.stringify(vars));
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: bodyParams.toString(),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Twilio returned status ${res.status}: ${errText}`);
        }
        return { success: true };
      } else {
        // Standard single message send (no template)
        const bodyParams = new URLSearchParams();
        bodyParams.append('From', `whatsapp:${sender_phone}`);
        bodyParams.append('To', `whatsapp:+${formattedPhone}`);
        bodyParams.append('Body', message);
        
        if (documentUrl) {
          bodyParams.append('MediaUrl', documentUrl);
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: bodyParams.toString(),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Twilio returned status ${res.status}: ${errText}`);
        }
        return { success: true };
      }
    }

    // C. WhatsApp Cloud API (Meta)
    if (provider === 'cloud_api') {
      const url = api_url || `https://graph.facebook.com/v17.0/${instance_id}/messages`;
      
      const payload: any = {
        messaging_product: 'whatsapp',
        to: formattedPhone,
      };

      if (buttons && buttons.length > 0) {
        payload.type = 'interactive';
        payload.interactive = {
          type: 'button',
          body: {
            text: message
          },
          action: {
            buttons: buttons.map(btn => ({
              type: 'reply',
              reply: {
                id: btn.id,
                title: btn.title
              }
            }))
          }
        };

        if (documentUrl) {
          payload.interactive.header = {
            type: 'document',
            document: {
              link: documentUrl,
              filename: filename || 'Document.pdf'
            }
          };
        }
      } else if (documentUrl) {
        payload.type = 'document';
        payload.document = {
          link: documentUrl,
          filename: filename || 'Document.pdf',
          caption: message
        };
      } else {
        payload.type = 'text';
        payload.text = { body: message };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`WhatsApp Cloud API returned status ${res.status}: ${errText}`);
      }
      return { success: true };
    }

    // D. Custom Gateway API
    if (provider === 'custom') {
      if (!api_url) throw new Error('API URL is required for custom gateway');
      const res = await fetch(api_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(access_token ? { 'Authorization': `Bearer ${access_token}` } : {})
        },
        body: JSON.stringify({
          to: formattedPhone,
          message: message,
          sender: sender_phone,
          document_url: documentUrl || null,
          filename: filename || null
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Custom gateway returned status ${res.status}: ${errText}`);
      }
      return { success: true };
    }

    throw new Error(`Unsupported WhatsApp provider: ${provider}`);
  } catch (error: any) {
    console.error('Error sending WhatsApp message:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Automate status change notifications
 */
export const sendStatusChangeNotification = async (
  customerName: string,
  phone: string,
  projectCode: string,
  newStatusLabel: string
) => {
  const message = `Dear ${customerName},\n\nWe are pleased to inform you that your solar project (*${projectCode}*) status has been updated to: *${newStatusLabel}*.\n\nThank you for choosing Mayukh Solar!\n\nBest Regards,\nMayukh Solar Team`;
  return sendWhatsAppMessage({ phone, message });
};

/**
 * Send pre-sale/project quotations manually with optional attached PDF URL
 */
export const sendQuotationNotification = async (
  customerName: string,
  phone: string,
  quoteNumber: string,
  quotePrice: number,
  capacity: string,
  documentUrl?: string
) => {
  const message = `Dear ${customerName},\n\nWe have generated a quotation for your requested ${capacity} Solar Power Plant.\n\n*Quotation Details:*\n• *Quotation No:* ${quoteNumber}\n• *Offered Price:* ₹${Number(quotePrice).toLocaleString('en-IN')}\n\n${documentUrl ? 'Please find the detailed quotation PDF attached above.\n\n' : ''}---\n✅ *To ACCEPT this quotation, click CONFIRM or reply:*\n*CONFIRM ${quoteNumber}*\n\n❌ *To DECLINE, click REJECT or reply:*\n*REJECT ${quoteNumber}*\n---\n\nOur representative will contact you shortly. Thank you!\n\nBest Regards,\nMayukh Solar Team`;
  return sendWhatsAppMessage({ 
    phone, 
    message, 
    documentUrl, 
    filename: `Quotation_${quoteNumber}.pdf`,
    buttons: [
      { id: `CONFIRM ${quoteNumber}`, title: 'Confirm' },
      { id: `REJECT ${quoteNumber}`, title: 'Reject' }
    ],
    contentSid: 'HXb5b62575e6e4ff6129ad7c8efe1f983e',
    contentVariables: {
      "1": quoteNumber,
      "2": `₹${Number(quotePrice).toLocaleString('en-IN')}`
    }
  });
};


/**
 * Send bills/invoices manually with attached PDF URL
 */
export const sendBillNotification = async (
  customerName: string,
  phone: string,
  projectCode: string,
  billType: string,
  fileUrl?: string
) => {
  const message = `Dear ${customerName},\n\nWe have sent you the *${billType}* for your solar project *${projectCode}*.\n\nThank you for your business!\n\nBest Regards,\nMayukh Solar Team`;
  return sendWhatsAppMessage({ 
    phone, 
    message, 
    documentUrl: fileUrl, 
    filename: `${billType.replace(/\s+/g, '_')}_${projectCode}.pdf` 
  });
};
