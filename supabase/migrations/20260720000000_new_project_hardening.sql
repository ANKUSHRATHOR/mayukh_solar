-- Hardening for a fresh Supabase project.
--
-- The migration history carries debt from a long firefighting session. Replaying
-- it verbatim onto a new project reproduces the schema the app expects — which
-- is what we want — but also reproduces three problems that must not exist on
-- day one. This migration runs last and undoes them.
--
-- Deliberately NOT a hand-written baseline: rebuilding 31 tables, ~30 functions
-- and every RLS policy from scratch risks silent divergence from what the app
-- and the generated types expect, and there is no way to verify it without a
-- database to test against. Replay-then-harden is the lower-risk path to the
-- same end state.

-- ---------------------------------------------------------------------------
-- 1. Revoke the blanket anon grants
-- ---------------------------------------------------------------------------
-- 20260703193000 granted anon ALL PRIVILEGES on every table, sequence and
-- function, and set ALTER DEFAULT PRIVILEGES so future tables inherit it. RLS
-- still gates the 31 tables that enable it, but any table created later without
-- ENABLE ROW LEVEL SECURITY would be world-writable by an unauthenticated
-- caller holding only the publishable key.

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- anon still needs schema usage so PostgREST can serve the login flow; it just
-- gets no object privileges of its own.
GRANT USAGE ON SCHEMA public TO anon;

-- authenticated keeps table access — RLS is what actually constrains it.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Remove the seeded admin accounts
-- ---------------------------------------------------------------------------
-- Three migrations create admins with passwords committed to git:
--   20260330145740  admin@mayukhsolar.com      Admin@123
--   20260703174500  ankushrathor1996@gmail.com Admin@123
--   20260703191500  admin2@mayukhsolar.com     Admin@9988
-- Those credentials are public. They must not exist on a new project.
--
-- See the runbook in README for creating the first real admin: add the user in
-- the Supabase dashboard, then grant the role. That path is deliberately manual
-- — a self-serve bootstrap endpoint is exactly the hole that made
-- `bootstrap-admin` a privilege-escalation vector.

DO $$
DECLARE
  seeded_emails text[] := ARRAY[
    'admin@mayukhsolar.com',
    'ankushrathor1996@gmail.com',
    'admin2@mayukhsolar.com'
  ];
  victim uuid;
BEGIN
  FOR victim IN
    SELECT id FROM auth.users WHERE lower(email) = ANY(seeded_emails)
  LOOP
    DELETE FROM public.user_roles WHERE user_id = victim;
    DELETE FROM public.staff     WHERE user_id = victim;
    DELETE FROM auth.identities  WHERE user_id = victim;
    DELETE FROM auth.users       WHERE id = victim;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Drop duplicate triggers
-- ---------------------------------------------------------------------------
-- Each of these fires the same function as a differently-named sibling created
-- by a later migration that never dropped the original. Assignment
-- notifications currently fire twice, and every lead update is audited twice.
-- Keeping the `trg_`-prefixed convention.

DROP TRIGGER IF EXISTS notify_lead_assigned_trigger ON public.leads;
DROP TRIGGER IF EXISTS notify_lead_assigned_insert  ON public.leads;
DROP TRIGGER IF EXISTS audit_lead_changes           ON public.leads;
DROP TRIGGER IF EXISTS update_leads_updated_at      ON public.leads;

-- ---------------------------------------------------------------------------
-- 4. Correct the quotation_details default
-- ---------------------------------------------------------------------------
-- 20260713000000 migrated existing rows from object to array shape but left the
-- column default as '{}'::jsonb, so every newly created lead regressed to the
-- old shape and the webhook had to branch on both.

ALTER TABLE public.leads ALTER COLUMN quotation_details SET DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 5. Guard against future unprotected tables
-- ---------------------------------------------------------------------------
-- Reports any public table without RLS. Not enforcement — a visible check an
-- admin can run after adding tables.

CREATE OR REPLACE FUNCTION public.tables_without_rls()
RETURNS TABLE(table_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.relname::text
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND NOT c.relrowsecurity
   ORDER BY c.relname;
$$;

REVOKE EXECUTE ON FUNCTION public.tables_without_rls() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.tables_without_rls() TO service_role;

NOTIFY pgrst, 'reload schema';
