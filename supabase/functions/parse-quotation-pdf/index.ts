// Parse a vendor quotation PDF and extract firm details (GSTIN, mobile, bank, address).
// Admin-only. Returns a structured vendor profile candidate without saving.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function pickFirstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function parseVendor(text: string) {
  const clean = text.replace(/\u00A0/g, " ").replace(/[ \t]+/g, " ");
  const gstin = pickFirstMatch(clean, /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z])\b/);
  const ifsc = pickFirstMatch(clean, /\b([A-Z]{4}0[A-Z0-9]{6})\b/);
  const mobile = pickFirstMatch(clean, /(?:Mob(?:ile)?\.?|Phone|Contact)[^0-9]{0,8}(\+?\d[\d\s-]{8,}\d)/i)
    || pickFirstMatch(clean, /\b(\+?91[\s-]?[6-9]\d{9})\b/)
    || pickFirstMatch(clean, /\b([6-9]\d{9})\b/);
  const email = pickFirstMatch(clean, /([\w.+-]+@[\w-]+\.[\w.-]+)/);
  const account_no = pickFirstMatch(clean, /A\/?c(?:count)?(?:\s*No\.?|:)?\s*[:\-]?\s*(\d{8,20})/i);
  const bank_name = pickFirstMatch(clean, /Bank\s*(?:Name)?\s*[:\-]?\s*([A-Z][A-Za-z &.'()-]{3,60}?(?:Bank|BANK))/);
  const account_type = pickFirstMatch(clean, /\b(Current|Saving[s]?|CC|OD)\b\s*Account/i);
  const license_no = pickFirstMatch(clean, /Licen[cs]e\s*(?:No\.?|#)?\s*[:\-]?\s*([A-Z0-9-\/]{4,30})/i);

  // Firm name: first ALL CAPS line of length >= 4 with letters
  const firmLine = clean.split(/\r?\n/).map((l) => l.trim())
    .find((l) => /^[A-Z][A-Z0-9 .,&'()-]{4,80}$/.test(l) && /[A-Z]{3,}/.test(l));
  const firm_name = firmLine || null;

  // Address heuristic: line containing PIN code
  const address = pickFirstMatch(clean, /([^\n]{10,200}\b\d{6}\b[^\n]{0,40})/);

  return {
    firm_name, gstin, ifsc, mobile, email, account_no, bank_name, account_type, license_no, address,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const sbAuth = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await sbAuth.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const ctype = req.headers.get("content-type") || "";
    let bytes: Uint8Array | null = null;
    if (ctype.includes("application/json")) {
      const { base64 } = await req.json();
      if (!base64) throw new Error("Missing base64 PDF");
      const raw = atob(base64);
      bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    } else {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      if (!file) throw new Error("Missing file");
      bytes = new Uint8Array(await file.arrayBuffer());
    }

    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    const fullText = Array.isArray(text) ? text.join("\n") : text;
    const parsed = parseVendor(fullText);

    return new Response(JSON.stringify({ vendor: parsed, text_preview: fullText.slice(0, 2000) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse PDF";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
