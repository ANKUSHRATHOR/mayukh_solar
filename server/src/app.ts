import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { errorHandler } from "./http.js";
import { consumerLookupRouter } from "./routes/consumerLookup.js";
import { staffRouter } from "./routes/staff.js";
import { quotationsRouter } from "./routes/quotations.js";
import { pushRouter } from "./routes/push.js";
import { whatsappRouter } from "./routes/whatsapp.js";

/**
 * The configured Express app, with no listener attached.
 *
 * `index.ts` calls `listen()` on it for local/standalone use; `api/[...path].ts`
 * exports it directly as a Vercel Function, where calling `listen()` would break.
 */
const app = express();

app.disable("x-powered-by");
app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type", "x-client-info", "apikey"],
  }),
);

// Mounted before the JSON parser: the webhook needs the unparsed body, because
// providers send either JSON or form-encoded payloads.
app.use("/api", whatsappRouter);

app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api", consumerLookupRouter);
app.use("/api", staffRouter);
app.use("/api", quotationsRouter);
app.use("/api", pushRouter);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);

export default app;
