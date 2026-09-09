-- Split the `projects` module into projects / payments / operations.
--
-- One module gated seven routes: the project list and detail, project documents,
-- home location, material dispatch, the operator console, and both payments
-- pages. Every role held it, but the row policies behind those pages were
-- written for admin, operator and sales-on-own. So a telecaller, welder or
-- electrician was offered a payments ledger, a material-dispatch page and an
-- operator console that are structurally empty, with write buttons RLS rejects.
--
-- After this:
--   projects   -> list, detail, documents, home location   (every role)
--   payments   -> /payments, /payments/:id                 (admin, sales, operator)
--   operations -> material dispatch, operator console       (admin, operator)
--
-- Rows are inserted with explicit `allowed` booleans rather than omitting the
-- denials, matching 20260724000000. loadPermissions falls back to
-- DEFAULT_ROLE_MODULES only when a role returns *zero* rows, so the false rows
-- are what let an admin deny everything without silently reverting to defaults.

INSERT INTO public.role_permissions (role, module, allowed) VALUES
  ('admin',        'payments',   true),
  ('telecaller',   'payments',   false),
  ('sales_person', 'payments',   true),
  ('operator',     'payments',   true),
  ('welder',       'payments',   false),
  ('electrician',  'payments',   false),

  ('admin',        'operations', true),
  ('telecaller',   'operations', false),
  ('sales_person', 'operations', false),
  ('operator',     'operations', true),
  ('welder',       'operations', false),
  ('electrician',  'operations', false)
ON CONFLICT (role, module) DO NOTHING;
