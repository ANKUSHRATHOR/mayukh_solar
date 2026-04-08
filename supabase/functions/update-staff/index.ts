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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, staff_id, user_id, full_name, mobile, role } = await req.json();

    if (action === "update") {
      if (!staff_id || !full_name || !mobile || !role) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update staff record
      const { error: staffError } = await adminClient.from("staff").update({
        full_name: full_name.trim(),
        mobile,
      }).eq("id", staff_id);
      if (staffError) throw staffError;

      // Update role
      const { error: roleError } = await adminClient.from("user_roles").update({
        role,
      }).eq("user_id", user_id);
      if (roleError) throw roleError;

      // Update auth email to match new mobile
      const mobileEmail = `${mobile}@mayukhsolar.app`;
      await adminClient.auth.admin.updateUserById(user_id, { email: mobileEmail });

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "reset_password") {
      if (!user_id || !staff_id) {
        return new Response(JSON.stringify({ error: "Missing user_id or staff_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate a temporary password
      const tempPassword = "Reset@" + Math.random().toString(36).slice(2, 8);

      // Update auth password
      const { error: pwError } = await adminClient.auth.admin.updateUserById(user_id, {
        password: tempPassword,
      });
      if (pwError) throw pwError;

      // Force password change on next login
      await adminClient.from("staff").update({ must_change_password: true }).eq("id", staff_id);

      return new Response(JSON.stringify({ success: true, temp_password: tempPassword }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "delete") {
      if (!staff_id || !user_id) {
        return new Response(JSON.stringify({ error: "Missing staff_id or user_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Prevent self-deletion
      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: "Cannot delete your own account" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete role, staff, then auth user
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.from("staff").delete().eq("id", staff_id);
      await adminClient.auth.admin.deleteUser(user_id);

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
