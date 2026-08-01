-- Configurable per-role module access.
-- Backs the "Roles & Access" UI in the User Management module. Each row says
-- whether a given app_role may access a given feature module. The client falls
-- back to an in-code default map when this table is empty/unavailable, so the
-- app keeps working before/without this migration — but persisted edits from
-- the admin UI require this table.

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role public.app_role NOT NULL,
  module TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (role, module)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may read permissions (needed to build their own nav
-- and gate their own routes). Only admins may modify them.
DROP POLICY IF EXISTS "Authenticated can read role permissions" ON public.role_permissions;
CREATE POLICY "Authenticated can read role permissions"
  ON public.role_permissions FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can insert role permissions" ON public.role_permissions;
CREATE POLICY "Admins can insert role permissions"
  ON public.role_permissions FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update role permissions" ON public.role_permissions;
CREATE POLICY "Admins can update role permissions"
  ON public.role_permissions FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete role permissions" ON public.role_permissions;
CREATE POLICY "Admins can delete role permissions"
  ON public.role_permissions FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_role_permissions_updated_at ON public.role_permissions;
CREATE TRIGGER update_role_permissions_updated_at
  BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed defaults. admin = all modules. telecaller/sales_person = crm + site_visits
-- + projects (+ common utilities). operator/welder/electrician = projects only
-- (+ common utilities: tasks, attendance, contacts).
INSERT INTO public.role_permissions (role, module, allowed)
VALUES
  -- admin: full access
  ('admin', 'crm', true),
  ('admin', 'site_visits', true),
  ('admin', 'projects', true),
  ('admin', 'tasks', true),
  ('admin', 'attendance', true),
  ('admin', 'contacts', true),
  -- telecaller
  ('telecaller', 'crm', true),
  ('telecaller', 'site_visits', true),
  ('telecaller', 'projects', true),
  ('telecaller', 'tasks', true),
  ('telecaller', 'attendance', true),
  ('telecaller', 'contacts', true),
  -- sales_person
  ('sales_person', 'crm', true),
  ('sales_person', 'site_visits', true),
  ('sales_person', 'projects', true),
  ('sales_person', 'tasks', true),
  ('sales_person', 'attendance', true),
  ('sales_person', 'contacts', true),
  -- operator: projects + utilities
  ('operator', 'crm', false),
  ('operator', 'site_visits', false),
  ('operator', 'projects', true),
  ('operator', 'tasks', true),
  ('operator', 'attendance', true),
  ('operator', 'contacts', true),
  -- welder: projects + utilities
  ('welder', 'crm', false),
  ('welder', 'site_visits', false),
  ('welder', 'projects', true),
  ('welder', 'tasks', true),
  ('welder', 'attendance', true),
  ('welder', 'contacts', true),
  -- electrician: projects + utilities
  ('electrician', 'crm', false),
  ('electrician', 'site_visits', false),
  ('electrician', 'projects', true),
  ('electrician', 'tasks', true),
  ('electrician', 'attendance', true),
  ('electrician', 'contacts', true)
ON CONFLICT (role, module) DO NOTHING;
