-- Cache of Google Drive folder ids.
--
-- Documents move to Google Drive, and every upload needs the folder for its
-- customer. Resolving that by name costs a Drive search per upload, and two
-- concurrent uploads for the same customer race into two folders with the same
-- name -- Drive permits duplicates, so the second is silently a different
-- place. Remembering the id here makes the lookup free and the unique
-- constraint makes the loser of a race reuse the winner's folder.
--
-- Written only by the `drive-storage` edge function on the service role. No
-- client ever reads it, so RLS is on with no policy at all: service role
-- bypasses RLS, everyone else sees nothing.

CREATE TABLE IF NOT EXISTS public.drive_folders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'project' | 'lead' | 'quotation' | 'dispatch' | 'scope:<name>' |
  -- 'attendance:<yyyy-mm>' | 'attendance:month'
  scope      text NOT NULL,
  -- The row the folder belongs to: a project/lead/staff uuid, a month, or
  -- '__root__' for the per-scope top-level folder. Text rather than uuid
  -- because those last two are not ids.
  owner_key  text NOT NULL,
  folder_id  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drive_folders_scope_owner_key UNIQUE (scope, owner_key)
);

ALTER TABLE public.drive_folders ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.drive_folders IS
  'Google Drive folder id cache. Service-role only, written by the drive-storage edge function.';
