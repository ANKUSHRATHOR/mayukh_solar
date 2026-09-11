# Google Drive document storage — setup

Documents (project and lead files, quotation PDFs, attendance and task photos,
material-dispatch photos) are stored in Google Drive, under one company Google
account. This is the one-time setup that makes that work. Until it is done the
app still runs: every file uploaded before the switch keeps loading from
Supabase Storage, and a new upload fails with a clear "Google Drive is not
configured" message rather than a generic error.

Budget about 20 minutes. You need to be signed in as the **company Google
account** that will own the documents.

## Before you start — two things to be clear about

**Storage quota.** Check it — `drive/v3/about?fields=storageQuota` reports the
real number. A free `@gmail.com` account has only 15 GB shared with Gmail and
Photos, which attendance photos (roughly two per staff member per working day,
on the order of 5 GB a year for 20 staff) would eventually fill. A paid Google
One or Workspace plan makes this a non-issue.

**Account ownership.** This account will own your customers' Aadhaar and PAN
scans. Turn on 2-factor authentication, and set the recovery phone and email to
something the business controls, not one person's personal number. If the
account is locked out, every document in the CRM becomes unreachable at once.

## 1. Create a Google Cloud project and enable the Drive API

1. Go to <https://console.cloud.google.com/>, signed in as the company account.
2. Create a project — call it `Mayukh Solar CRM`.
3. **APIs & Services → Library**, search for **Google Drive API**, click
   **Enable**.

## 2. Configure the OAuth consent screen

**APIs & Services → OAuth consent screen.**

1. User type: **External**.
2. App name `Mayukh Solar CRM`, support email and developer email: the company
   account.
3. **Scopes → Add or remove scopes**, add `https://www.googleapis.com/auth/drive.file`.
   That scope only grants access to files this app itself creates — it cannot
   read the rest of the account's Drive.
4. **Publish the app** ("Publishing status: In production").

> This step is not optional. While the consent screen is in **Testing**, Google
> expires the refresh token after **7 days**, and every document in the CRM
> stops loading at once with no warning.

## 3. Create the OAuth client

**APIs & Services → Credentials → Create credentials → OAuth client ID.**

- Application type: **Web application**
- Name: `Mayukh Solar CRM`
- Authorised redirect URIs: `http://localhost:8080/oauth2callback`

Copy the **Client ID** and **Client secret**.

## 4. Mint the refresh token

This is a one-off. In a browser signed in as the company account, open this URL
with your client id substituted in:

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:8080/oauth2callback&response_type=code&scope=https://www.googleapis.com/auth/drive.file&access_type=offline&prompt=consent
```

`access_type=offline` and `prompt=consent` are what make Google return a
refresh token — without both you get an access token that dies in an hour.

Approve the consent screen. The browser lands on a "can't be reached" page —
that is expected, there is no server there. Copy the `code=` value out of the
address bar and exchange it (the code is single-use and expires in minutes):

```bash
curl -s https://oauth2.googleapis.com/token \
  -d client_id=YOUR_CLIENT_ID \
  -d client_secret=YOUR_CLIENT_SECRET \
  -d code=PASTE_THE_CODE_HERE \
  -d grant_type=authorization_code \
  -d redirect_uri=http://localhost:8080/oauth2callback
```

Save the `refresh_token` from the response. Google will not show it again.

## 5. Create the root folder — through the API, not the Drive UI

**Do not create this folder by hand.** The `drive.file` scope grants access to
files *the app itself created*, and nothing else. A folder made in the Drive web
UI is invisible to the app: every upload into it fails with a 404 that reads
like the folder does not exist. It has to be created with these credentials.

```bash
ACCESS_TOKEN=$(curl -s https://oauth2.googleapis.com/token \
  -d client_id=YOUR_CLIENT_ID -d client_secret=YOUR_CLIENT_SECRET \
  -d refresh_token=YOUR_REFRESH_TOKEN -d grant_type=refresh_token \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

curl -s https://www.googleapis.com/drive/v3/files?fields=id \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Mayukh Solar CRM","mimeType":"application/vnd.google-apps.folder"}'
```

Save the `id` it returns. The folder shows up in Drive normally and staff can
browse it; the restriction is only on what the *app* may reach.

The app creates `Projects/`, `Leads/`, `Quotations/`, `Attendance/` and
`Dispatch/` inside it on first use, with a sub-folder per customer named
K-Number then customer name, so the folders are browsable by a person who does
not know a row id. Those are app-created too, so they are reachable.

## 6. Set the function secrets

These are secrets in the same category as the Supabase service_role key: they
never go in `.env` and never reach the browser bundle.

```bash
supabase secrets set \
  GOOGLE_CLIENT_ID=... \
  GOOGLE_CLIENT_SECRET=... \
  GOOGLE_REFRESH_TOKEN=... \
  GDRIVE_ROOT_FOLDER_ID=...
```

Or in the dashboard: **Project Settings → Edge Functions → Secrets**.

## 7. Deploy

```bash
supabase db push
supabase functions deploy drive-storage
```

## 8. Check it works

In the app, open a lead, upload a document, and confirm all three:

- the file appears in Drive under `Mayukh Solar CRM / Leads / {customer}`
- Preview shows it inline, Download saves it with the right name and extension
- Delete removes it from the CRM and puts it in the Drive bin

Then open a project that has a document from **before** this change and confirm
preview and download still work — those still come from Supabase Storage, and
that dual read is what makes the migration safe.

## How it fits together

- `supabase/functions/drive-storage/` is the only thing that talks to Google.
  Files are never link-shared; every read is proxied through this function,
  which re-checks the caller against RLS first.
- `src/lib/fileStore.ts` is the only thing the app calls. It reads the provider
  off the stored value — `gdrive:<id>` is Drive, anything else is a legacy
  Supabase Storage path — so nothing else in the codebase has to know.
- Sending a document to a customer over WhatsApp cannot use a private Drive
  file, so `createShareLink` copies the bytes to a `shared/` prefix in Supabase
  Storage and signs that for 7 days. The Drive original stays private.

## If something breaks

| Symptom | Cause |
|---|---|
| "The Google refresh token has been revoked or expired" | Consent screen left in Testing (7-day expiry), account password changed, or access revoked. Redo steps 2 and 4. |
| "Google Drive is not configured" | One of the four secrets is missing. |
| Uploads fail with a quota message | The account's Drive storage is full. |
| A 404 on the root folder, or "File not found" on upload | `GDRIVE_ROOT_FOLDER_ID` names a folder created in the Drive UI rather than through the API. `drive.file` cannot see it — recreate it as in step 5. |
| A document uploaded before the switch won't open | That is a Supabase Storage read, not a Drive one — check the bucket, not this. |
