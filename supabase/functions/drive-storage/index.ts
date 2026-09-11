/**
 * Google Drive document storage.
 *
 * The only thing in the system that talks to Google. Drive files are private
 * to the company account and never link-shared, so every read and write is
 * proxied through here.
 *
 * Authorization is delegated to RLS rather than reimplemented. A request names
 * a *row* (`documents`, `material_dispatches`, `tasks`, `attendance_events`),
 * never a raw Drive id, and the row is read or written through a client
 * carrying the caller's own JWT. If the caller may not see it, RLS returns
 * nothing and we answer 403 without ever touching Drive. That means the
 * existing policies stay the single source of truth, and a new document
 * surface inherits its permissions for free.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DriveError, getMetadata, streamFile, trashFile, uploadFile } from "./drive.ts";
import { GoogleAuthError } from "./google-auth.ts";
import { resolveFolder, SCOPES, type Scope } from "./folders.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "content-disposition, content-type, content-length",
};

/** A Drive-backed reference, as stored in the DB. */
const DRIVE_PREFIX = "gdrive:";
const driveIdOf = (ref: string | null): string | null =>
  ref && ref.startsWith(DRIVE_PREFIX) ? ref.slice(DRIVE_PREFIX.length) : null;

/**
 * Which tables may be addressed, and which column on each holds the file
 * reference. A whitelist, so a caller cannot point this at `staff` or
 * `system_configs` and read a column it was never meant to expose.
 */
const FILE_COLUMNS: Record<string, string> = {
  documents: "file_url",
  material_dispatches: "image_url",
  tasks: "proof_image_path",
  attendance_events: "bike_meter_image_path",
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const requireFileColumn = (table: unknown): string => {
  if (typeof table !== "string" || !(table in FILE_COLUMNS)) {
    throw new HttpError("Unknown document source.", 400);
  }
  return FILE_COLUMNS[table];
};

/**
 * The caller must be able to write the row a new file will hang off. Checked
 * against the owner (project, lead, staff member) rather than the document
 * row, which for a first upload does not exist yet.
 *
 * This gates Drive-side file creation only; the document row itself is still
 * written by the client under RLS, exactly as it was with Supabase Storage.
 */
const assertCanWriteScope = async (
  caller: SupabaseClient,
  callerId: string,
  scope: Scope,
  ownerId: string,
  isAdmin: boolean,
): Promise<void> => {
  if (scope === "attendance") {
    // Attendance photos are the staff member's own; nobody uploads for
    // someone else, not even an admin.
    if (ownerId !== callerId) throw new HttpError("You can only upload your own attendance photo.", 403);
    return;
  }

  const table = scope === "project" || scope === "dispatch" ? "projects" : "leads";
  const { data, error } = await caller.from(table).select("id").eq("id", ownerId).maybeSingle();
  if (error) throw new HttpError(error.message, 403);
  if (!data && !isAdmin) throw new HttpError("You do not have access to this record.", 403);
  if (!data) throw new HttpError("That record no longer exists.", 404);
};

/** Reads a row's file reference through the caller's client, so RLS decides. */
const readRef = async (
  caller: SupabaseClient,
  table: string,
  column: string,
  rowId: string,
): Promise<string | null> => {
  const { data, error } = await caller.from(table).select(column).eq("id", rowId).maybeSingle();
  if (error) throw new HttpError(error.message, 403);
  if (!data) throw new HttpError("You do not have access to this document.", 403);
  return (data as Record<string, string | null>)[column] ?? null;
};

const handleUpload = async (
  req: Request,
  caller: SupabaseClient,
  admin: SupabaseClient,
  callerId: string,
  isAdmin: boolean,
): Promise<Response> => {
  const form = await req.formData();
  const scope = String(form.get("scope") ?? "") as Scope;
  const ownerId = String(form.get("ownerId") ?? "");
  const replaceRef = form.get("replaceRef");
  const file = form.get("file");

  if (!SCOPES.includes(scope)) throw new HttpError("Unknown upload scope.", 400);
  if (!ownerId) throw new HttpError("Missing the record this file belongs to.", 400);
  if (!(file instanceof File)) throw new HttpError("No file was sent.", 400);

  await assertCanWriteScope(caller, callerId, scope, ownerId, isAdmin);

  const folderId = await resolveFolder(admin, scope, ownerId);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const uploaded = await uploadFile(
    file.name || "document",
    file.type || "application/octet-stream",
    folderId,
    bytes,
  );

  // Replacing a document: the old file is trashed only after the new one is
  // safely in Drive, so a failed upload never loses the original.
  const previous = typeof replaceRef === "string" ? driveIdOf(replaceRef) : null;
  if (previous && previous !== uploaded.id) {
    await trashFile(previous).catch(() => {
      // A stray file in Drive is untidy; failing the upload over it would be
      // worse, since the new file and the row update are already good.
    });
  }

  return json({
    ref: `${DRIVE_PREFIX}${uploaded.id}`,
    name: uploaded.name,
    mimeType: uploaded.mimeType,
    size: uploaded.size,
  });
};

const handleFetch = async (
  caller: SupabaseClient,
  body: Record<string, unknown>,
): Promise<Response> => {
  const column = requireFileColumn(body.table);
  const rowId = String(body.rowId ?? "");
  if (!rowId) throw new HttpError("Missing the document to fetch.", 400);

  const ref = await readRef(caller, String(body.table), column, rowId);
  const fileId = driveIdOf(ref);
  if (!fileId) throw new HttpError("This document is not stored in Google Drive.", 404);

  const metadata = await getMetadata(fileId);
  const upstream = await streamFile(fileId);
  const disposition = body.disposition === "attachment" ? "attachment" : "inline";
  const filename = (typeof body.filename === "string" && body.filename) || metadata.name;

  return new Response(upstream.body, {
    headers: {
      ...corsHeaders,
      "Content-Type": metadata.mimeType,
      "Content-Disposition": `${disposition}; filename="${filename.replace(/"/g, "")}"`,
      // Private data behind an Authorization header — never let a shared proxy
      // hold on to it.
      "Cache-Control": "private, max-age=300",
    },
  });
};

const handleDelete = async (
  caller: SupabaseClient,
  body: Record<string, unknown>,
): Promise<Response> => {
  const table = String(body.table ?? "");
  const column = requireFileColumn(body.table);
  const rowId = String(body.rowId ?? "");
  if (!rowId) throw new HttpError("Missing the document to delete.", 400);

  const ref = await readRef(caller, table, column, rowId);
  const fileId = driveIdOf(ref);

  // The write itself is the permission check: RLS decides whether this caller
  // may remove the row (or clear its file), and we only touch Drive if it did.
  if (body.keepRow === true) {
    const { data, error } = await caller
      .from(table)
      .update({ [column]: null })
      .eq("id", rowId)
      .select("id");
    if (error) throw new HttpError(error.message, 403);
    if (!data?.length) throw new HttpError("You cannot change this document.", 403);
  } else {
    const { data, error } = await caller.from(table).delete().eq("id", rowId).select("id");
    if (error) throw new HttpError(error.message, 403);
    if (!data?.length) throw new HttpError("You cannot delete this document.", 403);
  }

  if (fileId) {
    // Best effort, and deliberately after the row is gone: a file left in the
    // Drive bin is recoverable, a row pointing at a deleted file is not.
    await trashFile(fileId).catch(() => {});
  }

  return json({ ok: true });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new HttpError("Not authenticated", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) throw new HttpError("Invalid token", 401);

    // Service role is used only for the folder bookkeeping in `drive_folders`
    // and for reading names to label folders with — never to fetch a file the
    // caller was not already allowed to see.
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      return await handleUpload(req, caller, admin, user.id, isAdmin === true);
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    switch (body.action) {
      case "fetch":
        return await handleFetch(caller, body);
      case "delete":
        return await handleDelete(caller, body);
      default:
        throw new HttpError("Unknown action.", 400);
    }
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof DriveError) return json({ error: error.message }, error.status);
    // A misconfigured or revoked Google credential is an operator problem, not
    // a caller problem — say so plainly rather than as a generic 500.
    if (error instanceof GoogleAuthError) return json({ error: error.message }, 503);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
