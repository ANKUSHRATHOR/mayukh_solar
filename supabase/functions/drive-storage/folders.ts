/**
 * Where a file lands in Drive.
 *
 * Folders are named the way the app names things to people — K-Number, then
 * customer name, then mobile — so that someone browsing Drive directly can
 * find a customer without knowing a row id.
 *
 * Resolved ids are cached in `public.drive_folders`. Without the cache every
 * upload costs a Drive search, and two concurrent uploads for the same
 * customer race into two folders of the same name (Drive allows duplicates).
 * The unique constraint on (scope, owner_key) makes the loser of that race
 * reuse the winner's folder.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { findOrCreateFolder } from "./drive.ts";

export type Scope = "project" | "lead" | "quotation" | "attendance" | "dispatch";

export const SCOPES: Scope[] = ["project", "lead", "quotation", "attendance", "dispatch"];

/** Top-level folder per scope, created once under the configured root. */
const SCOPE_FOLDER: Record<Scope, string> = {
  project: "Projects",
  lead: "Leads",
  quotation: "Quotations",
  attendance: "Attendance",
  dispatch: "Dispatch",
};

/** Drive tolerates most characters; `/` and control characters are the risk. */
const sanitise = (name: string): string =>
  name.replace(/[\/\\\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Unnamed";

/**
 * The human label for a folder. Falls back through the same order the app
 * uses to identify a project: K-Number, customer name, mobile, then the id.
 */
const folderNameFor = async (
  admin: SupabaseClient,
  scope: Scope,
  ownerId: string,
): Promise<string> => {
  if (scope === "attendance") {
    // Grouped by staff member; the month is a sub-folder added by the caller.
    const { data } = await admin.from("staff").select("full_name").eq("user_id", ownerId).maybeSingle();
    return sanitise(data?.full_name ?? ownerId);
  }

  if (scope === "project" || scope === "dispatch") {
    const { data } = await admin
      .from("projects")
      .select("k_number, lead_id, leads(customer_name, mobile, k_number)")
      .eq("id", ownerId)
      .maybeSingle();
    const lead = (data as any)?.leads;
    const kNumber = (data as any)?.k_number || lead?.k_number;
    const parts = [kNumber, lead?.customer_name || lead?.mobile].filter(Boolean);
    return sanitise(parts.join(" - ") || ownerId);
  }

  // lead, quotation
  const { data } = await admin
    .from("leads")
    .select("customer_name, mobile, k_number")
    .eq("id", ownerId)
    .maybeSingle();
  const parts = [(data as any)?.k_number, (data as any)?.customer_name || (data as any)?.mobile]
    .filter(Boolean);
  return sanitise(parts.join(" - ") || ownerId);
};

/** Cache key for a scope folder itself (no owner row behind it). */
const SCOPE_ROOT_KEY = "__root__";

/**
 * In-memory memo in front of the `drive_folders` table.
 *
 * A folder id never changes once resolved, so a warm isolate should not spend
 * a database round trip re-reading one. This matters most for the handful of
 * structural folders (`Projects/`, `Leads/`, the current month) that every
 * single upload passes through.
 */
const memo = new Map<string, string>();

/**
 * The folder id for a cache key, creating it only on a miss.
 *
 * `name` is a thunk rather than a string on purpose: resolving the human name
 * costs a query against `leads` or `projects`, and on the common path -- an
 * upload to a customer who already has a folder -- that name is never needed.
 * Passing it eagerly added a database round trip to every upload.
 */
const cachedFolder = async (
  admin: SupabaseClient,
  scope: string,
  ownerKey: string,
  name: () => Promise<string> | string,
  parentId: () => Promise<string>,
): Promise<string> => {
  const memoKey = `${scope}\u0000${ownerKey}`;
  const remembered = memo.get(memoKey);
  if (remembered) return remembered;

  const { data: existing } = await admin
    .from("drive_folders")
    .select("folder_id")
    .eq("scope", scope)
    .eq("owner_key", ownerKey)
    .maybeSingle();
  if (existing?.folder_id) {
    memo.set(memoKey, existing.folder_id as string);
    return existing.folder_id as string;
  }

  const folderId = await findOrCreateFolder(await name(), await parentId());

  // Two isolates can reach here together. `findOrCreateFolder` means they
  // agree on the same Drive folder unless they raced the search too, and the
  // upsert then settles which id is remembered.
  const { data: written } = await admin
    .from("drive_folders")
    .upsert({ scope, owner_key: ownerKey, folder_id: folderId }, { onConflict: "scope,owner_key" })
    .select("folder_id")
    .maybeSingle();

  const settled = (written?.folder_id as string) ?? folderId;
  memo.set(memoKey, settled);
  return settled;
};

export const rootFolderId = (): string => {
  const id = Deno.env.get("GDRIVE_ROOT_FOLDER_ID");
  if (!id) throw new Error("Google Drive is not configured. Set GDRIVE_ROOT_FOLDER_ID.");
  return id;
};

/**
 * The folder a file for this owner belongs in, creating the chain
 * root → scope → owner (→ month, for attendance) as needed.
 *
 * Every step is lazy: on a warm cache this is one indexed lookup and no Drive
 * traffic at all, so the request goes straight to uploading bytes.
 */
export const resolveFolder = async (
  admin: SupabaseClient,
  scope: Scope,
  ownerId: string,
): Promise<string> => {
  const scopeFolder = () =>
    cachedFolder(admin, `scope:${scope}`, SCOPE_ROOT_KEY, SCOPE_FOLDER[scope], async () =>
      rootFolderId());

  const ownerName = () => folderNameFor(admin, scope, ownerId);

  if (scope === "attendance") {
    // Attendance is the high-volume scope: a month sub-folder keeps any one
    // Drive folder browsable rather than accumulating thousands of selfies.
    const month = new Date().toISOString().slice(0, 7);
    const monthFolder = () =>
      cachedFolder(admin, "attendance:month", month, month, scopeFolder);
    return cachedFolder(admin, `attendance:${month}`, ownerId, ownerName, monthFolder);
  }

  return cachedFolder(admin, scope, ownerId, ownerName, scopeFolder);
};
