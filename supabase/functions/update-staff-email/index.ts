import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email } = await req.json();
    const clean = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (clean.endsWith("@mayukhsolar.app")) {
      return new Response(JSON.stringify({ error: "Use your real email address" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Make sure email isn't taken by another auth user
    const { data: existing } = await admin.auth.admin.listUsers();
    const conflict = existing?.users?.find((u) => u.email?.toLowerCase() === clean && u.id !== user.id);
    if (conflict) {
      return new Response(JSON.stringify({ error: "Email already in use" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update auth.users email (auto-confirmed so OTP login works immediately)
    const { error: authErr } = await admin.auth.admin.updateUserById(user.id, {
      email: clean,
      email_confirm: true,
    });
    if (authErr) throw authErr;

    // Sync staff.email
    const { error: staffErr } = await admin.from("staff").update({ email: clean }).eq("user_id", user.id);
    if (staffErr) throw staffErr;

    return new Response(JSON.stringify({ success: true, email: clean }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
