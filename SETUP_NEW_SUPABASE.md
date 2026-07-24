# Connecting to the new Supabase project

Target project: **`fjpjgsfcnicslwhrjqgl`** ("Mayukh Solar", ap-south-1, Postgres 17).

## Status: done, except step 5

| Step | State |
|---|---|
| Migrations pushed (93) | ✅ |
| Schema verified — 33 tables, all with RLS | ✅ |
| Zero auth users, zero anon grants | ✅ |
| 12-stage pipeline live | ✅ |
| Storage buckets created (3, all private) | ✅ |
| Edge functions deployed (7) | ✅ |
| `.env` wired to the new project | ✅ |
| `types.ts` regenerated from live schema | ✅ |
| **Create the first admin** | ⬜ **you must do this** |

Nothing can sign in until step 5 is done — the schema has zero auth users by
design.

**Rotate the access token you shared** (Dashboard → Account → Access Tokens). It
was pasted in plaintext into a chat transcript.

---

## Why replay the migrations instead of writing a fresh schema

The 91 existing migrations produce exactly the schema the app and
`src/integrations/supabase/types.ts` expect. Hand-writing a clean baseline for 31
tables, ~30 functions and every RLS policy would risk silent divergence, and
there's no way to verify it here — this machine has no Docker, so
`supabase db reset` can't validate a baseline locally.

So: replay all 91, then `20260720000000_new_project_hardening.sql` removes the
debt they carry. Net result is a clean project without the guesswork.

**What the hardening migration undoes:**

| Problem | Origin | Fix |
|---|---|---|
| `anon` granted ALL PRIVILEGES on everything, including future tables | `20260703193000` | Revoked, plus the `ALTER DEFAULT PRIVILEGES` that made it permanent |
| Three admin accounts with passwords in public git history | `20260330145740`, `20260703174500`, `20260703191500` | Accounts deleted |
| Duplicate triggers — notifications fire twice, leads audited twice | `20260403045853` vs `20260516045937` | Redundant triggers dropped |
| `quotation_details` default still `'{}'` so new leads regress to the old shape | `20260713000000` | Default corrected to `'[]'` |

**One thing it cannot fix:** Postgres can't drop enum values. Replaying creates
the original 20 `project_status` values before `20260719000100` migrates to the
12-stage pipeline, so 8 dead values remain in the type forever. They're harmless
— `src/lib/projectStages.ts` labels them "(legacy)" and nothing writes them — but
you should know they're there. Eliminating them entirely would require the
hand-written baseline, with the risk described above.

---

## Steps

### 1. Authenticate the CLI

```bash
npx supabase login
```

### 2. Link to the new project

```bash
npx supabase link --project-ref fjpjgsfcnicslwhrjqgl
```

Prompts for the database password (Dashboard → Project Settings → Database).

### 3. Push all migrations

```bash
npx supabase db push
```

This applies 92 migrations in order, ending with the hardening one. Expect it to
take a few minutes.

### 4. Verify

```bash
# Should return zero rows — every table must have RLS.
npx supabase db execute "SELECT * FROM public.tables_without_rls();"

# Should return zero rows — no seeded admins survived.
npx supabase db execute \
  "SELECT email FROM auth.users WHERE email LIKE '%mayukhsolar%' OR email = 'ankushrathor1996@gmail.com';"

# Should list the 12 new stages alongside the 8 legacy ones.
npx supabase db execute \
  "SELECT unnest(enum_range(NULL::project_status));"
```

### 5. Create your first admin

Deliberately manual. A self-serve bootstrap endpoint is exactly what made the old
`bootstrap-admin` function a privilege-escalation vector — anyone with the public
key could mint themselves an admin or overwrite yours.

1. Dashboard → Authentication → Users → **Add user**. Set a real password.
2. Copy the new user's UUID.
3. Run, substituting the UUID and your details:

```sql
INSERT INTO public.staff (user_id, full_name, mobile, email, is_active, must_change_password)
VALUES ('<uuid>', 'Your Name', '9876543210', 'you@example.com', true, false);

INSERT INTO public.user_roles (user_id, role)
VALUES ('<uuid>', 'admin');
```

### 6. Set the publishable key

`.env` has a placeholder. Replace it from Dashboard → Project Settings → API Keys:

```
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
```

The app will not connect until this is set.

### 7. Deploy the edge functions

They live in the old project and need deploying to the new one:

```bash
npx supabase functions deploy consumer-lookup   # verify_jwt = false, per config.toml
npx supabase functions deploy create-staff
npx supabase functions deploy update-staff
npx supabase functions deploy update-staff-email
npx supabase functions deploy generate-quotation
npx supabase functions deploy send-push
npx supabase functions deploy whatsapp-webhook
```

Then set their secrets (Dashboard → Edge Functions → Secrets):
`INTERNAL_PUSH_SECRET`, and the VAPID keys for `send-push`.

**Do not deploy `bootstrap-admin`** — it was deleted for the reason above. If it
is still deployed on the *old* project, remove it there:
`npx supabase functions delete bootstrap-admin`.

### 8. Create the storage bucket

`20260330145241` creates the `project-documents` bucket, so `db push` handles it.
Confirm under Dashboard → Storage that it exists and is **private**.

### 9. Regenerate types

Several casts in the codebase exist only because `types.ts` is stale — it
predates `system_configs`, the `admin_*` RPCs, and the columns added in
`20260719*`. Regenerating lets those casts be removed:

```bash
npx supabase gen types typescript --project-id fjpjgsfcnicslwhrjqgl \
  > src/integrations/supabase/types.ts
npm run typecheck
```

### 10. Smoke test

```bash
npm run dev
```

Sign in as the admin from step 5, then check: Projects list loads with All/Cash/Loan
tabs; a project detail page opens with its three tabs; Staff Directory lists your
admin.

---

## What this creates

A **blank schema** — confirmed, not assumed. No data is copied from
`lytaftfydwcbxfwegkop`, and nothing in the migrations inserts business records.

Every `INSERT INTO leads/projects/attendance/...` in the migration history sits
inside a function body (RPCs like `punch_attendance`), so it only runs when the
app calls it — never at migration time.

Three config seeds do run, and should:

| Seed | Migration |
|---|---|
| `project-documents` storage bucket (private) | `20260330145241` |
| Plant-spec dropdown options | `20260705010000` |
| PM Surya Ghar subsidy slabs | `20260718000000` |

You'll add all leads, projects and staff through the app.

**Step 5 is your only way in.** The seeded admin accounts are deleted by the
hardening migration, so until you create your own admin there is no account that
can sign in.
