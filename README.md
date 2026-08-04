# Mayukh Solar CRM

Copy of the original app with a Node/Express backend added. Same frontend, same
Supabase database.

## Architecture

- **Frontend** (`src/`) — React + Vite + shadcn/ui. Unchanged, and still talks to
  Supabase directly for CRUD, auth, storage and realtime. RLS remains the
  security boundary for all of that.
- **Backend** (`server/`) — Express API holding the Supabase service-role key.
  It serves the privileged operations that previously ran as Supabase Edge
  Functions. See [server/README.md](server/README.md) for the route table.
- **Database** — the same Supabase project as the original app. No schema
  changes; `supabase/migrations/` is carried over as-is.

The frontend reaches the backend through `src/lib/apiClient.ts`, which returns
the same `{ data, error }` shape `supabase.functions.invoke` did.

## Running locally

Two terminals.

```bash
cd server && npm install && npm run dev
```

```bash
npm install && npm run dev
```

The Vite dev server proxies `/api/*` to `http://localhost:8787`, so no CORS
setup is needed in development.

Before the backend will start, set `SUPABASE_SERVICE_ROLE_KEY` in `server/.env`.

## Deploying

Deploy `server/` anywhere that runs Node (Railway, Render, Fly, a VM). Then set
`VITE_API_URL` in the frontend `.env` to that server's public origin and rebuild.
