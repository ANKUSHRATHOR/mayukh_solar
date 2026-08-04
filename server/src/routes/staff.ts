import { randomUUID, randomInt } from "node:crypto";
import { Router } from "express";
import { HttpError, asyncHandler } from "../http.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { admin } from "../supabase.js";

export const staffRouter = Router();

const MOBILE_EMAIL_DOMAIN = "@mayukhsolar.app";

/** 6-digit numeric PIN — easy to read out over the phone. */
function generateTempPin(): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += randomInt(0, 10).toString();
  return out;
}

/**
 * Finds an auth user by email. `listUsers` pages at 1000, and this project can
 * have more staff than one page, so walk until the results run short.
 */
async function findAuthUserByEmail(email: string) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users ?? [];
    const match = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (users.length < 1000) return null;
  }
  return null;
}

// ── POST /api/create-staff ──────────────────────────────────────────────────
staffRouter.post(
  "/create-staff",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const caller = req.user!;
    const { full_name, mobile, role } = req.body ?? {};

    if (!full_name || !mobile || !role) {
      throw new HttpError(400, "Missing required fields");
    }

    // The schema caps the org at two admins.
    if (role === "admin") {
      const { data: adminCount } = await admin.rpc("count_admins");
      if (adminCount && adminCount >= 2) {
        throw new HttpError(400, "Maximum 2 admin accounts allowed");
      }
    }

    const tempPin = generateTempPin();
    const mobileEmail = `${mobile}${MOBILE_EMAIL_DOMAIN}`;
    const existingUser = await findAuthUserByEmail(mobileEmail);

    let userId: string;
    let hasStaffRow = false;

    if (existingUser) {
      const { data: existingStaff } = await admin
        .from("staff")
        .select("id, is_active")
        .eq("user_id", existingUser.id)
        .maybeSingle();

      // Reuse the auth user for this mobile. An existing staff row means this is
      // a reactivation, not a conflict.
      await admin.from("user_roles").delete().eq("user_id", existingUser.id);
      const { error: resetErr } = await admin.auth.admin.updateUserById(existingUser.id, {
        password: tempPin,
        email_confirm: true,
      });
      if (resetErr) throw resetErr;

      if (existingStaff) {
        hasStaffRow = true;
        const { error: updateErr } = await admin
          .from("staff")
          .update({
            full_name: String(full_name).trim(),
            mobile,
            is_active: true,
            must_change_password: true,
            temp_password_plain: tempPin,
            temp_password_issued_at: new Date().toISOString(),
            temp_password_issued_by: caller.id,
          })
          .eq("id", existingStaff.id);
        if (updateErr) throw updateErr;
      }

      userId = existingUser.id;
    } else {
      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email: mobileEmail,
        password: tempPin,
        email_confirm: true,
      });
      if (authError) throw authError;
      userId = authData.user.id;
    }

    // Covers brand-new users and orphaned auth users whose staff row was hard-deleted.
    if (!hasStaffRow) {
      const { error: staffError } = await admin.from("staff").insert({
        user_id: userId,
        full_name: String(full_name).trim(),
        mobile,
        must_change_password: true,
        is_active: true,
        temp_password_plain: tempPin,
        temp_password_issued_at: new Date().toISOString(),
        temp_password_issued_by: caller.id,
      });
      if (staffError) throw staffError;
    }

    const { error: roleError } = await admin.from("user_roles").insert({ user_id: userId, role });
    if (roleError) throw roleError;

    res.json({ success: true, temp_pin: tempPin, user_id: userId });
  }),
);

// ── POST /api/update-staff ──────────────────────────────────────────────────
staffRouter.post(
  "/update-staff",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const caller = req.user!;
    const { action, staff_id, user_id, full_name, mobile, role } = req.body ?? {};

    if (action === "update") {
      if (!staff_id || !full_name || !mobile || !role) {
        throw new HttpError(400, "Missing required fields");
      }
      const { error: staffError } = await admin
        .from("staff")
        .update({ full_name: String(full_name).trim(), mobile })
        .eq("id", staff_id);
      if (staffError) throw staffError;

      const { error: roleError } = await admin
        .from("user_roles")
        .update({ role })
        .eq("user_id", user_id);
      if (roleError) throw roleError;

      await admin.auth.admin.updateUserById(user_id, {
        email: `${mobile}${MOBILE_EMAIL_DOMAIN}`,
      });
      return res.json({ success: true });
    }

    if (action === "reset_password") {
      if (!user_id || !staff_id) throw new HttpError(400, "Missing user_id or staff_id");

      const tempPassword = generateTempPin();
      const { error: pwError } = await admin.auth.admin.updateUserById(user_id, {
        password: tempPassword,
        email_confirm: true,
      });
      if (pwError) throw pwError;

      await admin
        .from("staff")
        .update({
          must_change_password: true,
          temp_password_plain: tempPassword,
          temp_password_issued_at: new Date().toISOString(),
          temp_password_issued_by: caller.id,
        })
        .eq("id", staff_id);

      await admin.from("password_reset_logs").insert({
        staff_user_id: user_id,
        reset_by_user_id: caller.id,
        meta: { method: "admin_reset" },
      });

      return res.json({ success: true, temp_password: tempPassword });
    }

    if (action === "delete") {
      if (!staff_id || !user_id) throw new HttpError(400, "Missing staff_id or user_id");
      if (user_id === caller.id) throw new HttpError(400, "Cannot delete your own account");

      // Revoking the role removes app access immediately, whichever path below wins.
      await admin.from("user_roles").delete().eq("user_id", user_id);

      // Hard delete first. Historical references (leads, projects, documents,
      // site_visits, audit_logs) will trip FK constraints — fall back to a
      // soft-delete that preserves the created-by / assigned-to trail.
      let hardDeleted = false;
      try {
        const { error: staffDelError } = await admin.from("staff").delete().eq("id", staff_id);
        if (staffDelError) throw staffDelError;
        await admin.auth.admin.deleteUser(user_id);
        hardDeleted = true;
      } catch {
        const randomPwd = randomUUID() + randomUUID();
        try {
          await admin.auth.admin.updateUserById(user_id, {
            password: randomPwd,
            email: `deleted-${user_id}${MOBILE_EMAIL_DOMAIN}`,
            ban_duration: "876000h", // ~100 years
          } as never);
        } catch {
          // Best-effort; the role removal above already blocks login.
        }
        await admin
          .from("staff")
          .update({ is_active: false, must_change_password: true, temp_password_plain: null })
          .eq("id", staff_id);
      }

      return res.json({ success: true, hard_deleted: hardDeleted });
    }

    throw new HttpError(400, "Invalid action");
  }),
);

// ── POST /api/update-staff-email ────────────────────────────────────────────
// Any signed-in user may set their own email; no role check.
staffRouter.post(
  "/update-staff-email",
  requireAuth,
  asyncHandler(async (req, res) => {
    const caller = req.user!;
    const clean = String(req.body?.email ?? "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new HttpError(400, "Invalid email");
    if (clean.endsWith(MOBILE_EMAIL_DOMAIN)) {
      throw new HttpError(400, "Use your real email address");
    }

    const conflict = await findAuthUserByEmail(clean);
    if (conflict && conflict.id !== caller.id) {
      throw new HttpError(409, "Email already in use");
    }

    // Auto-confirm so email OTP login works right away.
    const { error: authErr } = await admin.auth.admin.updateUserById(caller.id, {
      email: clean,
      email_confirm: true,
    });
    if (authErr) throw authErr;

    const { error: staffErr } = await admin
      .from("staff")
      .update({ email: clean })
      .eq("user_id", caller.id);
    if (staffErr) throw staffErr;

    res.json({ success: true, email: clean });
  }),
);
