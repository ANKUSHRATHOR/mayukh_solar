import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify the caller is an authenticated admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin using their JWT
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { full_name, mobile, role } = await req.json();

    if (!full_name || !mobile || !role) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin limit
    if (role === "admin") {
      const { data: adminCount } = await adminClient.rpc("count_admins");
      if (adminCount && adminCount >= 2) {
        return new Response(JSON.stringify({ error: "Maximum 2 admin accounts allowed" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Strong-but-readable temp password (HIBP-safe): Ms<4 letters><4 digits>!
    const _lett = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const _dig = "23456789";
    const _r = new Uint32Array(8);
    crypto.getRandomValues(_r);
    let tempPin = "Ms";
    for (let i = 0; i < 4; i++) tempPin += _lett[_r[i] % _lett.length];
    for (let i = 4; i < 8; i++) tempPin += _dig[_r[i] % _dig.length];
    tempPin += "!";
    const mobileEmail = `${mobile}@mayukhsolar.app`;

    // Check if user already exists — paginate listUsers because the default
    // page size only returns the first 50 users and we may have many.
    let existingUser: any = null;
    for (let page = 1; page <= 50 && !existingUser; page++) {
      const { data: pageData, error: listErr } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (listErr) throw listErr;
      const users = pageData?.users || [];
      existingUser = users.find((u: any) => u.email === mobileEmail) || null;
      if (users.length < 1000) break;
    }

    let userId: string;

    if (existingUser) {
      // Check if already in staff table (active staff with this mobile already exists)
      const { data: existingStaff } = await adminClient
        .from("staff")
        .select("id")
        .eq("user_id", existingUser.id)
        .maybeSingle();

      if (existingStaff) {
        return new Response(JSON.stringify({ error: "Staff member with this mobile already exists" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Orphan auth user from a previous delete — clean up any stale role rows,
      // reset password, and re-confirm email so they can sign in again.
      await adminClient.from("user_roles").delete().eq("user_id", existingUser.id);
      const { error: resetErr } = await adminClient.auth.admin.updateUserById(existingUser.id, {
        password: tempPin,
        email_confirm: true,
      });
      if (resetErr) throw resetErr;
      userId = existingUser.id;
    } else {
      // Create new auth user
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email: mobileEmail,
        password: tempPin,
        email_confirm: true,
      });
      if (authError) throw authError;
      userId = authData.user.id;
    }

    // Create staff record
    const { error: staffError } = await adminClient.from("staff").insert({
      user_id: userId,
      full_name: full_name.trim(),
      mobile,
      must_change_password: true,
    });
    if (staffError) throw staffError;

    // Assign role
    const { error: roleError } = await adminClient.from("user_roles").insert({
      user_id: userId,
      role,
    });
    if (roleError) throw roleError;

    return new Response(
      JSON.stringify({ success: true, temp_pin: tempPin, user_id: userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
