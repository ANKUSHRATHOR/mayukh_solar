// Overdue payment reminders.
//
// A project's balance is due within `payment_due_days` of the plant going live
// (the `net_meter_installed` stage). This function finds the ones that are past
// that, writes an in-app notification and fires a web push to every admin, then
// stamps `payment_due_notified_at` so the same project does not ping every
// morning for the rest of its life.
//
// Admins only, deliberately: money chasing is the owner's job, and nothing goes
// to the customer. See the plan's decisions.
//
// Runs unattended, so it authenticates with INTERNAL_PUSH_SECRET rather than a
// user JWT — the same secret send-push already accepts from DB triggers. An
// admin JWT is also accepted, so the function can be triggered by hand.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const money = (value: number) => `₹${Math.round(Number(value ?? 0)).toLocaleString("en-IN")}`;

/**
 * A project stops being re-announced for a week. Long enough not to nag,
 * short enough that a debt nobody acted on resurfaces.
 */
const RENOTIFY_AFTER_DAYS = 7;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const INTERNAL_SECRET = Deno.env.get("INTERNAL_PUSH_SECRET") ?? "";

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  let authorized = Boolean(bearer && INTERNAL_SECRET && bearer === INTERNAL_SECRET);
  if (!authorized && authHeader) {
    const asCaller = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await asCaller.auth.getUser();
    if (user) {
      const { data: isAdmin } = await admin.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      authorized = Boolean(isAdmin);
    }
  }
  if (!authorized) return json({ error: "Unauthorized" }, 401);

  try {
    const { data: dueDaysRaw } = await admin.rpc("payment_due_days");
    const dueDays = Number(dueDaysRaw ?? 2);

    // project_dues is security_invoker, so service_role sees every row — which
    // is what a system job wants. It already excludes closed and fully paid
    // projects.
    const { data: rows, error } = await admin
      .from("project_dues")
      .select("project_id, k_number, customer_name, mobile, balance, days_overdue")
      .eq("is_overdue", true);
    if (error) throw error;

    const candidates = rows ?? [];
    if (candidates.length === 0) return json({ overdue: 0, notified: 0, admins: 0 });

    // Skip anything announced recently.
    const cutoff = new Date(Date.now() - RENOTIFY_AFTER_DAYS * 86_400_000).toISOString();
    const { data: recent } = await admin
      .from("projects")
      .select("id")
      .in("id", candidates.map((c) => c.project_id))
      .gt("payment_due_notified_at", cutoff);

    const muted = new Set((recent ?? []).map((r) => r.id));
    const fresh = candidates.filter((c) => !muted.has(c.project_id));
    if (fresh.length === 0) {
      return json({ overdue: candidates.length, notified: 0, admins: 0, reason: "all recently notified" });
    }

    const { data: adminRoles } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = [...new Set((adminRoles ?? []).map((r) => r.user_id))];
    if (adminIds.length === 0) return json({ overdue: fresh.length, notified: 0, admins: 0 });

    const total = fresh.reduce((sum, r) => sum + Number(r.balance ?? 0), 0);
    const worst = [...fresh].sort((a, b) => Number(b.balance) - Number(a.balance))[0];

    // One digest, not one push per project: a morning of eleven separate
    // notifications is a morning of eleven dismissed notifications. Projects are
    // named by K-Number first, per the house identity convention.
    const title =
      fresh.length === 1
        ? `Payment overdue — ${worst.k_number ?? worst.customer_name ?? "project"}`
        : `${fresh.length} payments overdue`;
    const message =
      fresh.length === 1
        ? `${money(worst.balance)} outstanding, ${worst.days_overdue} day(s) past the ${dueDays}-day window.`
        : `${money(total)} outstanding across ${fresh.length} projects past the ${dueDays}-day window. Largest: ${
            worst.k_number ?? worst.customer_name ?? "project"
          } at ${money(worst.balance)}.`;

    await admin.from("notifications").insert(
      adminIds.map((user_id) => ({
        user_id,
        title,
        message,
        type: "warning",
        entity_type: "payment_dues",
        entity_id: fresh.length === 1 ? worst.project_id : null,
      })),
    );

    // Push is best-effort: an admin with no subscription, or a dead endpoint,
    // must not stop the rest of the run or the stamping below.
    const pushed = await Promise.allSettled(
      adminIds.map((user_id) =>
        fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${INTERNAL_SECRET}`,
          },
          body: JSON.stringify({
            user_id,
            title,
            message,
            entity_type: "payment_dues",
            entity_id: fresh.length === 1 ? worst.project_id : null,
          }),
        }),
      ),
    );

    await admin
      .from("projects")
      .update({ payment_due_notified_at: new Date().toISOString() })
      .in("id", fresh.map((r) => r.project_id));

    return json({
      overdue: candidates.length,
      notified: fresh.length,
      admins: adminIds.length,
      pushes_sent: pushed.filter((p) => p.status === "fulfilled").length,
    });
  } catch (err) {
    console.error("notify-payment-dues error", err);
    return json({ error: err instanceof Error ? err.message : "error" }, 500);
  }
});
