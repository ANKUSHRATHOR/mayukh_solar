/**
 * The Drive REST calls this app makes. Deliberately small: create a file,
 * stream a file, delete a file, and find-or-create a folder.
 *
 * Files are created without any `permissions` call, so they stay private to
 * the company account. Every read the app serves goes back through this
 * function, which re-checks the caller against RLS first — a Drive link that
 * leaks would otherwise be an un-revocable hole straight to a customer's
 * Aadhaar.
 */

import { getAccessToken } from "./google-auth.ts";

const FILES_API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export class DriveError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

const authHeaders = async (): Promise<Record<string, string>> => ({
  Authorization: `Bearer ${await getAccessToken()}`,
});

const failed = async (response: Response, what: string): Promise<never> => {
  const text = await response.text().catch(() => "");
  // Drive answers 403 for both "no permission" and "quota exceeded"; the
  // second is the one this deployment will actually hit, so surface the body.
  throw new DriveError(`Google Drive ${what} failed (${response.status}): ${text.slice(0, 300)}`);
};

/** Escapes a name for the Drive `q` query language, which quotes with '. */
const escapeQuery = (value: string): string => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export const findFolder = async (name: string, parentId: string): Promise<string | null> => {
  const q = [
    `name = '${escapeQuery(name)}'`,
    `'${escapeQuery(parentId)}' in parents`,
    `mimeType = '${FOLDER_MIME}'`,
    "trashed = false",
  ].join(" and ");

  const url = `${FILES_API}?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`;
  const response = await fetch(url, { headers: await authHeaders() });
  if (!response.ok) await failed(response, "folder lookup");

  const body = await response.json();
  return body.files?.[0]?.id ?? null;
};

export const createFolder = async (name: string, parentId: string): Promise<string> => {
  const response = await fetch(`${FILES_API}?fields=id`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  if (!response.ok) await failed(response, "folder creation");

  const body = await response.json();
  return body.id as string;
};

export const findOrCreateFolder = async (name: string, parentId: string): Promise<string> =>
  (await findFolder(name, parentId)) ?? (await createFolder(name, parentId));

export interface UploadedFile {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
}

/**
 * Multipart upload — metadata and bytes in one request. Suitable up to a few
 * MB, which is all this app sends: images are compressed to ~0.5 MB before
 * they get here and the document forms cap uploads at 10-15 MB.
 */
export const uploadFile = async (
  name: string,
  mimeType: string,
  parentId: string,
  bytes: Uint8Array,
): Promise<UploadedFile> => {
  const boundary = `mayukh-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name, parents: [parentId] });

  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);

  // A Blob rather than one concatenated Uint8Array: joining them copied the
  // whole file a second time, which on a 10 MB scan is 10 MB of pointless
  // memcpy inside an isolate with a fixed memory budget.
  const body = new Blob([head, bytes, tail]);

  const response = await fetch(`${UPLOAD_API}?uploadType=multipart&fields=id,name,mimeType,size`, {
    method: "POST",
    headers: {
      ...(await authHeaders()),
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!response.ok) await failed(response, "upload");

  const file = await response.json();
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size ? Number(file.size) : null,
  };
};

export interface FileMetadata {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
}

export const getMetadata = async (fileId: string): Promise<FileMetadata> => {
  const url = `${FILES_API}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,trashed`;
  const response = await fetch(url, { headers: await authHeaders() });
  if (response.status === 404) throw new DriveError("This file is no longer in Google Drive.", 404);
  if (!response.ok) await failed(response, "metadata lookup");

  const file = await response.json();
  if (file.trashed) throw new DriveError("This file has been moved to the Drive bin.", 404);

  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size ? Number(file.size) : null,
  };
};

/** The raw bytes, as a streaming response we can hand straight to the caller. */
export const streamFile = async (fileId: string): Promise<Response> => {
  const url = `${FILES_API}/${encodeURIComponent(fileId)}?alt=media`;
  const response = await fetch(url, { headers: await authHeaders() });
  if (response.status === 404) throw new DriveError("This file is no longer in Google Drive.", 404);
  if (!response.ok) await failed(response, "download");
  return response;
};

/**
 * Trashes rather than hard-deletes. A mis-click in the CRM should be
 * recoverable from the Drive bin for 30 days; permanent deletion of a
 * customer's identity document is not something to do on one confirm dialog.
 */
export const trashFile = async (fileId: string): Promise<void> => {
  const response = await fetch(`${FILES_API}/${encodeURIComponent(fileId)}`, {
    method: "PATCH",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
  // Already gone is a success for our purposes — the caller wants it absent.
  if (response.status === 404) return;
  if (!response.ok) await failed(response, "delete");
};
