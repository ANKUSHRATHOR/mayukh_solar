import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/capture';
import { failJob, finishJob, setProgress, startJob } from '@/lib/uploadQueue';

/**
 * Where a file lives, resolved in one place.
 *
 * Documents are moving to Google Drive, but every file uploaded before the
 * move is still in Supabase Storage and must keep working — there is no bulk
 * migration. Rather than add a `storage_provider` column to each of the four
 * tables that reference a file, the provider is encoded in the value already
 * stored there:
 *
 *   "a1b2c3/aadhaar_front.jpg"  -> Supabase Storage path (legacy, unchanged)
 *   "gdrive:1AbCdEf..."         -> Google Drive file id
 *
 * Callers never branch on that. They hold a `FileHandle` and ask this module
 * for a URL, a download or a delete.
 */

export const DRIVE_PREFIX = 'gdrive:';

/** The tables that reference a stored file, and the column holding the ref. */
export type FileTable = 'documents' | 'material_dispatches' | 'tasks' | 'attendance_events';

/** The column on each table that holds the file reference. */
export const FILE_COLUMN: Record<FileTable, string> = {
  documents: 'file_url',
  material_dispatches: 'image_url',
  tasks: 'proof_image_path',
  attendance_events: 'bike_meter_image_path',
};

/** The bucket a legacy (pre-Drive) ref for each table lives in. */
const LEGACY_BUCKET: Record<FileTable, string> = {
  documents: 'project-documents',
  material_dispatches: 'material-dispatch',
  tasks: 'attendance-media',
  attendance_events: 'attendance-media',
};

export type UploadScope = 'project' | 'lead' | 'quotation' | 'attendance' | 'dispatch';

export interface FileHandle {
  /** The value stored in the DB: a `gdrive:` ref or a legacy storage path. */
  ref: string | null;
  /**
   * The row this file hangs off. Drive files are private and served through
   * an edge function that re-checks the caller against RLS, so a read is
   * addressed by row rather than by file id.
   */
  table: FileTable;
  rowId: string;
}

export const isDriveRef = (ref: string | null | undefined): boolean =>
  typeof ref === 'string' && ref.startsWith(DRIVE_PREFIX);

export const driveIdOf = (ref: string | null | undefined): string | null =>
  isDriveRef(ref) ? (ref as string).slice(DRIVE_PREFIX.length) : null;

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-storage`;

const accessToken = async (): Promise<string> => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Sign in again.');
  return token;
};

/** Pulls the message out of the function's JSON error body when there is one. */
const errorFrom = async (response: Response, fallback: string): Promise<Error> => {
  const body = await response.json().catch(() => null);
  return new Error(body?.error || fallback);
};

/**
 * Uploads to Google Drive and returns the ref to store.
 *
 * The caller still writes its own DB row afterwards, under RLS, exactly as it
 * did when uploading to Supabase Storage. Pass `replaceRef` when swapping a
 * document out: the old Drive file is trashed only once the new one is safely
 * stored.
 */
export const uploadFile = async (input: {
  scope: UploadScope;
  ownerId: string;
  file: File | Blob;
  filename?: string;
  replaceRef?: string | null;
  /** Shown in the upload panel. Defaults to the filename. */
  label?: string;
}): Promise<string> => {
  const filename = input.filename ?? (input.file instanceof File ? input.file.name : 'document');

  // Phone cameras produce 4-8 MB JPEGs, and the whole of that crosses the
  // network twice on its way to Drive. Compressing first is worth far more
  // than anything that can be shaved off the server side. A no-op for PDFs.
  const payload = await compressImage(
    input.file instanceof File ? input.file : new File([input.file], filename)
  );

  const form = new FormData();
  form.append('scope', input.scope);
  form.append('ownerId', input.ownerId);
  if (input.replaceRef) form.append('replaceRef', input.replaceRef);
  form.append('file', payload, filename);

  const jobId = startJob(input.label ?? filename);

  try {
    const body = await postWithProgress(form, await accessToken(), (pct) =>
      setProgress(jobId, pct)
    );
    if (!body?.ref) throw new Error('Google Drive did not return a file reference.');
    finishJob(jobId);
    return body.ref as string;
  } catch (error) {
    failJob(jobId, error instanceof Error ? error.message : String(error));
    throw error;
  }
};

/**
 * POSTs the form over XHR rather than `fetch`.
 *
 * `fetch` reports no upload progress at all -- the request is opaque until the
 * response arrives -- so a slow upload is indistinguishable from a hung one.
 * XHR still exposes `upload.onprogress`, which is what the panel needs.
 *
 * Progress reaching 100% means the bytes have left the browser; the edge
 * function is then still forwarding them to Google, which is why the store
 * caps in-flight progress below 100 until the response actually lands.
 */
const postWithProgress = (
  form: FormData,
  token: string,
  onProgress: (pct: number) => void
): Promise<{ ref?: string }> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', FUNCTION_URL, true);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress((event.loaded / event.total) * 100);
    };

    xhr.onload = () => {
      let parsed: { ref?: string; error?: string } = {};
      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {
        // A non-JSON body means the gateway failed before reaching our handler.
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(parsed);
      else reject(new Error(parsed.error || `Upload failed (${xhr.status}).`));
    };

    xhr.onerror = () => reject(new Error('Network error while uploading.'));
    xhr.ontimeout = () => reject(new Error('The upload timed out.'));
    xhr.send(form);
  });

/** Fetches a Drive file's bytes through the proxy, as a blob. */
const fetchDriveBlob = async (
  handle: FileHandle,
  disposition: 'inline' | 'attachment' = 'inline'
): Promise<Blob> => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'fetch',
      table: handle.table,
      rowId: handle.rowId,
      disposition,
    }),
  });
  if (!response.ok) throw await errorFrom(response, 'Could not open this document.');
  return response.blob();
};

export interface ResolvedFile {
  /** An object URL (Drive) or a signed URL (legacy Supabase Storage). */
  url: string;
  /**
   * The real content type. A Drive ref carries no file extension, so this is
   * the only way a preview can tell a PDF from a JPEG; for legacy paths it is
   * inferred from the extension, which is all those ever had.
   */
  mimeType: string;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  pdf: 'application/pdf',
};

const mimeForPath = (path: string): string =>
  MIME_BY_EXTENSION[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

/**
 * A URL the browser can render, plus what kind of file it is.
 *
 * Drive files are private, so an `<img src>` pointing at Google would 403 —
 * the request needs an Authorization header. Fetching to a blob works
 * identically in `<img>`, in an `<iframe>` for PDFs, and in a download anchor.
 *
 * An object URL holds memory until it is revoked; pass the URL to
 * `revokeFileUrl` when the view goes away. Signed URLs ignore that call.
 */
export const resolveFile = async (handle: FileHandle): Promise<ResolvedFile> => {
  if (!handle.ref) throw new Error('This record has no file attached.');

  if (isDriveRef(handle.ref)) {
    const blob = await fetchDriveBlob(handle);
    return { url: URL.createObjectURL(blob), mimeType: blob.type || 'application/octet-stream' };
  }

  const { data, error } = await supabase.storage
    .from(LEGACY_BUCKET[handle.table])
    .createSignedUrl(handle.ref, 3600);
  if (error) throw new Error(error.message);
  if (!data?.signedUrl) throw new Error('Could not create a link to this document.');
  return { url: data.signedUrl, mimeType: mimeForPath(handle.ref) };
};

/** Just the URL, for callers that do not care what kind of file it is. */
export const getFileUrl = async (handle: FileHandle): Promise<string> =>
  (await resolveFile(handle)).url;

/** Object URLs must be released; signed URLs are inert here. */
export const revokeFileUrl = (url: string | null | undefined): void => {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
};

/**
 * Resolves many files at once, keyed by ref.
 *
 * Legacy refs are signed in a single batched call — the lead documents grid
 * renders a thumbnail per row and would otherwise make one request each. Drive
 * refs are fetched in parallel; one that fails is simply absent from the map,
 * so a single unreadable file does not blank the whole grid.
 */
export const getFileUrls = async (handles: FileHandle[]): Promise<Record<string, ResolvedFile>> => {
  const withRef = handles.filter((h): h is FileHandle & { ref: string } => Boolean(h.ref));
  const map: Record<string, ResolvedFile> = {};

  const legacyByBucket = new Map<string, string[]>();
  for (const handle of withRef) {
    if (isDriveRef(handle.ref)) continue;
    const bucket = LEGACY_BUCKET[handle.table];
    legacyByBucket.set(bucket, [...(legacyByBucket.get(bucket) ?? []), handle.ref]);
  }

  await Promise.all([
    ...[...legacyByBucket].map(async ([bucket, paths]) => {
      const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
      data?.forEach((entry) => {
        if (entry.signedUrl && entry.path) {
          map[entry.path] = { url: entry.signedUrl, mimeType: mimeForPath(entry.path) };
        }
      });
    }),
    ...withRef
      .filter((handle) => isDriveRef(handle.ref))
      .map(async (handle) => {
        try {
          const blob = await fetchDriveBlob(handle);
          map[handle.ref] = {
            url: URL.createObjectURL(blob),
            mimeType: blob.type || 'application/octet-stream',
          };
        } catch {
          // Leave it out of the map — the caller falls back to a placeholder.
        }
      }),
  ]);

  return map;
};

/**
 * Saves the file to disk under a readable name.
 *
 * The extension comes from the stored ref for legacy paths and from the blob's
 * type for Drive files, because a Drive id carries no extension — an earlier
 * version of this forced `.bin` on everything.
 */
export const downloadFile = async (handle: FileHandle, label: string): Promise<void> => {
  if (!handle.ref) throw new Error('This record has no file attached.');
  const safeLabel = label.replace(/[^a-z0-9]+/gi, '_').toLowerCase();

  let blob: Blob;
  let extension: string;

  if (isDriveRef(handle.ref)) {
    blob = await fetchDriveBlob(handle, 'attachment');
    extension = extensionForMime(blob.type);
  } else {
    const url = await getFileUrl(handle);
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not download this document.');
    blob = await response.blob();
    extension = handle.ref.split('.').pop() ?? 'pdf';
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `${safeLabel}.${extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

/**
 * `||` rather than `??` at each step: Drive can report an empty content type,
 * and an empty subtype is falsy but not nullish -- which saved the file as
 * `invoice.` with no extension at all.
 */
export const extensionForMime = (mimeType: string): string =>
  MIME_EXTENSIONS[mimeType] || mimeType.split('/').pop()?.split('+')[0] || 'bin';

/**
 * True for anything the preview dialog can render inline.
 *
 * Accepts either a content type or a stored ref. Those are told apart by the
 * leading type, not by the presence of a `/` — every legacy path has one too
 * (`leads/{id}/electricity_bill.pdf`), and reading one as a content type
 * classified every legacy document as unpreviewable.
 */
const MIME_PREFIXES = ['image/', 'application/', 'text/', 'video/', 'audio/'];

export const isPreviewable = (mimeTypeOrRef: string | null | undefined): boolean => {
  if (!mimeTypeOrRef) return false;

  if (MIME_PREFIXES.some((prefix) => mimeTypeOrRef.startsWith(prefix))) {
    return /^image\/|^application\/pdf$/.test(mimeTypeOrRef);
  }

  const extension = mimeTypeOrRef.split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'].includes(extension ?? '');
};

/**
 * A URL a customer can open, for sending a document over WhatsApp.
 *
 * Drive files are private and served only through the proxy, so there is no
 * link to hand out — and a personal Google account cannot put an expiry on a
 * link-shared file, making "share it from Drive" permanent in practice. So a
 * share copies the bytes to the `shared/` prefix in Supabase Storage and signs
 * that, which expires on its own and can be revoked by deleting the copy.
 *
 * Legacy files are already in that bucket and are simply signed in place.
 */
export const createShareLink = async (
  handle: FileHandle,
  label: string,
  expiresInDays = 7
): Promise<string> => {
  if (!handle.ref) throw new Error('This record has no file attached.');
  const expiresInSeconds = expiresInDays * 24 * 60 * 60;

  if (!isDriveRef(handle.ref)) {
    const { data, error } = await supabase.storage
      .from(LEGACY_BUCKET[handle.table])
      .createSignedUrl(handle.ref, expiresInSeconds);
    if (error) throw new Error(error.message);
    return data!.signedUrl;
  }

  const blob = await fetchDriveBlob(handle);
  const safeLabel = label.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  const path = `shared/${handle.rowId}/${safeLabel}.${extensionForMime(blob.type)}`;

  const { error: uploadError } = await supabase.storage
    .from('project-documents')
    .upload(path, blob, { upsert: true, contentType: blob.type });
  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await supabase.storage
    .from('project-documents')
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw new Error(error.message);
  return data!.signedUrl;
};

/**
 * Removes the file, and by default the row that pointed at it.
 *
 * The DB write is the permission check: it runs under the caller's RLS, and
 * Drive is only touched if the row actually changed. Drive files are trashed
 * rather than purged, so a mis-click stays recoverable from the Drive bin.
 */
export const deleteFile = async (
  handle: FileHandle,
  options: { keepRow?: boolean } = {}
): Promise<void> => {
  if (isDriveRef(handle.ref)) {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'delete',
        table: handle.table,
        rowId: handle.rowId,
        keepRow: options.keepRow === true,
      }),
    });
    if (!response.ok) throw await errorFrom(response, 'Could not delete this document.');
    return;
  }

  // Legacy: remove the object first, best effort. A stale storage object with
  // no row is harmless; a row pointing at a missing file shows as broken.
  if (handle.ref) {
    await supabase.storage.from(LEGACY_BUCKET[handle.table]).remove([handle.ref]);
  }

  // `from()` is typed per table name, so a union of four tables and a computed
  // column key cannot be expressed without widening. Narrowed back immediately:
  // both the table and the column come from the maps at the top of this file,
  // never from a caller.
  const table = supabase.from(handle.table) as unknown as {
    update: (values: Record<string, null>) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
    delete: () => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
  };

  const { error } =
    options.keepRow === true
      ? await table.update({ [FILE_COLUMN[handle.table]]: null }).eq('id', handle.rowId)
      : await table.delete().eq('id', handle.rowId);

  if (error) throw new Error(error.message);
};
