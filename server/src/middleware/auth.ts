import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../http.js";
import { callerClient, hasRole } from "../supabase.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `requireAuth`. */
      user?: { id: string; email: string | null };
    }
  }
}

/** Rejects the request unless it carries a valid Supabase user JWT. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new HttpError(401, "Not authenticated");

    const { data, error } = await callerClient(authHeader).auth.getUser();
    if (error || !data.user) throw new HttpError(401, "Invalid token");

    req.user = { id: data.user.id, email: data.user.email ?? null };
    next();
  } catch (err) {
    next(err);
  }
}

/** Rejects the request unless the caller holds at least one of `roles`. Runs after `requireAuth`. */
export function requireRole(...roles: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw new HttpError(401, "Not authenticated");

      const results = await Promise.all(roles.map((role) => hasRole(userId, role)));
      if (!results.some(Boolean)) {
        throw new HttpError(403, roles.includes("admin") && roles.length === 1
          ? "Admin access required"
          : "Forbidden");
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
