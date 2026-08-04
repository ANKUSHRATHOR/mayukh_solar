import { supabase } from "@/integrations/supabase/client";

/**
 * Base URL of the Node backend. In dev, Vite proxies `/api` to it (see
 * vite.config.ts), so the default empty string keeps requests same-origin.
 */
export const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

/** Absolute URL of a backend route, for values shown to the user (e.g. webhook URLs). */
export function apiEndpointUrl(path: string): string {
  const clean = `/api/${path.replace(/^\//, "")}`;
  if (API_URL) return `${API_URL}${clean}`;
  return typeof window === "undefined" ? clean : `${window.location.origin}${clean}`;
}

export interface ApiResult<T = any> {
  data: T | null;
  error: Error | null;
}

/**
 * Calls a backend route and returns the same `{ data, error }` shape that
 * `supabase.functions.invoke` did, so call sites read identically.
 *
 * Unlike `functions.invoke`, a non-2xx response still yields the parsed body in
 * `data` — the routes reply with `{ error: message }`, and some callers read it.
 */
export async function invokeApi<T = any>(
  path: string,
  options: { body?: unknown; method?: string } = {},
): Promise<ApiResult<T>> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_URL}/api/${path.replace(/^\//, "")}`, {
      method: options.method ?? "POST",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }

    if (!res.ok) {
      const message = parsed?.error || `Request failed with status ${res.status}`;
      return { data: parsed, error: new Error(message) };
    }

    return { data: parsed as T, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Network request failed"),
    };
  }
}
