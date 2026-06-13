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

    const _pinArr = new Uint32Array(6);
    crypto.getRandomValues(_pinArr);
    const tempPin = Array.from(_pinArr).map((v) => v % 10).join("");
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
      const { data: existingStaff } = await adminClient
        .from("staff")
        .select("id, is_active")
        .eq("user_id", existingUser.id)
        .maybeSingle();

      // Reuse an existing auth user for this mobile. If a linked staff row already
      // exists, treat it as a reactivation/update instead of blocking creation.
      await adminClient.from("user_roles").delete().eq("user_id", existingUser.id);
      const { error: resetErr } = await adminClient.auth.admin.updateUserById(existingUser.id, {
        password: tempPin,
        email_confirm: true,
      });
      if (resetErr) throw resetErr;

      if (existingStaff) {
        const { error: existingStaffUpdateError } = await adminClient
          .from("staff")
          .update({
            full_name: full_name.trim(),
            mobile,
            is_active: true,
            must_change_password: true,
          })
          .eq("id", existingStaff.id);
        if (existingStaffUpdateError) throw existingStaffUpdateError;
      }

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
    if (!existingUser) {
      const { error: staffError } = await adminClient.from("staff").insert({
        user_id: userId,
        full_name: full_name.trim(),
        mobile,
        must_change_password: true,
      });
      if (staffError) throw staffError;
    }

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
