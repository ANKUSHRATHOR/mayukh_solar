import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateTempPassword(): string {
  // Strong-but-readable temp password that passes HIBP leaked-password check.
  // Format: Ms<4 letters><4 digits>! e.g. MsKpqr8421!
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const rand = new Uint32Array(8);
  crypto.getRandomValues(rand);
  let out = "Ms";
  for (let i = 0; i < 4; i++) out += letters[rand[i] % letters.length];
  for (let i = 4; i < 8; i++) out += digits[rand[i] % digits.length];
  return out + "!";
}

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
      const { error: staffError } = await adminClient.from("staff").update({
        full_name: full_name.trim(), mobile,
      }).eq("id", staff_id);
      if (staffError) throw staffError;
      const { error: roleError } = await adminClient.from("user_roles").update({ role }).eq("user_id", user_id);
      if (roleError) throw roleError;
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
      const tempPassword = generateTempPassword();
      const { error: pwError } = await adminClient.auth.admin.updateUserById(user_id, {
        password: tempPassword, email_confirm: true,
      });
      if (pwError) throw pwError;
      await adminClient.from("staff").update({
        must_change_password: true,
        temp_password_plain: tempPassword,
        temp_password_issued_at: new Date().toISOString(),
        temp_password_issued_by: caller.id,
      }).eq("id", staff_id);
      await adminClient.from("password_reset_logs").insert({
        staff_user_id: user_id,
        reset_by_user_id: caller.id,
        meta: { method: "admin_reset" },
      });
      return new Response(JSON.stringify({ success: true, temp_password: tempPassword }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "delete") {
      if (!staff_id || !user_id) {
        return new Response(JSON.stringify({ error: "Missing staff_id or user_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: "Cannot delete your own account" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.from("staff").delete().eq("id", staff_id);
      try {
        await adminClient.auth.admin.deleteUser(user_id);
      } catch (e: any) {
        if (!String(e?.message || "").toLowerCase().includes("not found")) throw e;
      }
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
