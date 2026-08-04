import { Router } from "express";
import { HttpError, asyncHandler } from "../http.js";

/**
 * Public proxy for K Number consumer lookup against the CESC Rajasthan portal.
 * Exists because the upstream sends no CORS headers, so the browser can't call it.
 */
export const consumerLookupRouter = Router();

consumerLookupRouter.post(
  "/consumer-lookup",
  asyncHandler(async (req, res) => {
    const kno = req.body?.kno;
    if (!kno || typeof kno !== "string") {
      throw new HttpError(400, "kno is required");
    }

    const url = `https://cescrajasthan.co.in/newconnection/it_request_handler.jsp?paramStr=service_kno_newcondet|${kno.trim()}`;
    const upstream = await fetch(url, { method: "GET" });
    const text = await upstream.text();

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    res.json({ ok: upstream.ok, status: upstream.status, data });
  }),
);
