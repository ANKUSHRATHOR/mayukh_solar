/**
 * Vercel Function entrypoint for the whole API.
 *
 * The catch-all filename makes Vercel route every `/api/*` request here with the
 * URL intact, so the `app.use("/api", …)` mounts inside the Express app keep
 * matching. The app is imported without a listener — see server/src/app.ts.
 */
import app from "../server/src/app.js";

export default app;
