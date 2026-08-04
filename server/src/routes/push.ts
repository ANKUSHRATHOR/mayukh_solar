import { Router } from "express";
import webpush from "web-push";
import { env } from "../env.js";
import { HttpError, asyncHandler } from "../http.js";
import { admin, callerClient, hasRole } from "../supabase.js";

export const pushRouter = Router();

if (env.vapidPublicKey && env.vapidPrivateKey) {
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
}

/** Public VAPID key the browser needs to create a subscription. */
pushRouter.get("/send-push", (_req, res) => {
  res.json({ publicKey: env.vapidPublicKey });
});

/**
 * Sends a web push to one user's subscriptions.
 *
 * Two ways to authorize: the internal shared secret (used by DB triggers and
 * admin tooling), or an admin/operator JWT. Other roles must not be able to
 * push arbitrary cross-user notifications.
 */
pushRouter.post(
  "/send-push",
  asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "");

    let authorized = false;
    if (bearer && env.internalPushSecret && bearer === env.internalPushSecret) {
      authorized = true;
    } else if (authHeader) {
      const { data } = await callerClient(authHeader).auth.getUser();
      if (data?.user) {
        const [isAdmin, isOperator] = await Promise.all([
          hasRole(data.user.id, "admin"),
          hasRole(data.user.id, "operator"),
        ]);
        authorized = isAdmin || isOperator;
      }
    }
    if (!authorized) throw new HttpError(401, "Unauthorized");

    const { user_id, title, message, entity_type, entity_id } = req.body ?? {};
    if (!user_id || !title || !message) throw new HttpError(400, "missing fields");

    const { data: subs, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", user_id);
    if (error) throw error;

    const payload = JSON.stringify({
      title,
      body: message,
      data: { entity_type, entity_id, url: "/" },
    });

    const results = await Promise.allSettled(
      (subs ?? []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
        } catch (err: any) {
          // Drop subscriptions the push service says are gone.
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await admin.from("push_subscriptions").delete().eq("id", s.id);
          }
          throw err;
        }
      }),
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    res.json({ sent, total: subs?.length ?? 0 });
  }),
);
