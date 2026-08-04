import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { env } from "./env.js";

// supabase-js builds a realtime client eagerly and Node 20 has no global
// WebSocket. We never use realtime here, but the constructor still needs one.
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WebSocket;
}

/**
 * Service-role client. Bypasses RLS, so every route that uses it must do its own
 * authorization check first — see `requireAuth` / `requireRole`.
 */
export const admin: SupabaseClient = createClient(env.supabaseUrl, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Anon client scoped to a caller's JWT, used only to resolve who they are. */
export function callerClient(authHeader: string): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
}

/** Mirrors the `has_role` SQL function the RLS policies use. */
export async function hasRole(userId: string, role: string): Promise<boolean> {
  const { data, error } = await admin.rpc("has_role", { _user_id: userId, _role: role });
  if (error) throw error;
  return data === true;
}
