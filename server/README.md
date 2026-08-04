# Mayukh Solar — Node backend

Express API that replaces the Supabase Edge Functions. It holds the service-role
key and performs the privileged operations the browser must not be trusted with.

Everything else is unchanged: the React app still talks to Supabase directly for
CRUD, auth, storage and realtime, and RLS is still the security boundary for
those. This server is only for the operations that need to bypass RLS.

## Setup

```bash
cd server && npm install
```

Then fill in `server/.env` (start from `.env.example`). `SUPABASE_SERVICE_ROLE_KEY`
is required — the process refuses to start without it.

## Run

```bash
npm run dev
```

Listens on `http://localhost:8787`. In dev the Vite server proxies `/api/*` to it,
so run the frontend with `npm run dev` from the repo root in a second terminal.

For production: `npm run build && npm start`, and set `VITE_API_URL` in the
frontend `.env` to this server's public origin.

## Routes

| Method | Path                      | Auth                                   | Replaces edge function |
| ------ | ------------------------- | -------------------------------------- | ---------------------- |
| POST   | `/api/consumer-lookup`    | public                                 | `consumer-lookup`      |
| POST   | `/api/create-staff`       | admin                                  | `create-staff`         |
| POST   | `/api/update-staff`       | admin                                  | `update-staff`         |
| POST   | `/api/update-staff-email` | any signed-in user (own email only)    | `update-staff-email`   |
| POST   | `/api/generate-quotation` | admin, operator, or assigned sales rep | `generate-quotation`   |
| GET    | `/api/send-push`          | public (returns the VAPID public key)  | `send-push`            |
| POST   | `/api/send-push`          | admin/operator JWT, or internal secret | `send-push`            |
| GET    | `/api/whatsapp-webhook`   | Meta verification challenge            | `whatsapp-webhook`     |
| POST   | `/api/whatsapp-webhook`   | provider webhook (unauthenticated)     | `whatsapp-webhook`     |
| GET    | `/health`                 | public                                 | —                      |

Role checks call the same `has_role` SQL function the RLS policies use, so the
server and the database agree on who may do what.

## Still to do before this replaces the edge functions in production

- Point the WhatsApp provider at this server's `/api/whatsapp-webhook` (the URL
  shown in Admin Settings updates automatically from `VITE_API_URL`).
- The push DB triggers still POST to the edge function URL — see the `fn_url`
  variable in `supabase/migrations/*_send-push` migrations. Update them to this
  server's `/api/send-push` when you cut over.
- `supabase/functions/` is left in place so the two can run side by side during
  the cutover. Delete it once traffic is fully moved.
