import app from "./app.js";
import { env } from "./env.js";

// Standalone entrypoint. On Vercel the app is served by `api/[...path].ts`
// instead, which must not open a listener.
app.listen(env.port, () => {
  console.log(`Mayukh Solar API listening on http://localhost:${env.port}`);
  console.log(`  Supabase project: ${env.supabaseUrl}`);
  console.log(`  Allowed origins:  ${env.corsOrigins.join(", ")}`);
});
