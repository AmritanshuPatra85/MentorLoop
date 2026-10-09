import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler";
import { validate } from "../../middleware/validate";

// Dev-only helpers to exercise error handling and validation. Mounted only in development.
export const debugRouter = Router();

debugRouter.get(
  "/error",
  asyncHandler(async () => {
    throw new Error("boom: this message must never reach the client");
  }),
);

debugRouter.get(
  "/validate",
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(100) }) }),
  (req, res) => {
    res.json({ ok: true, query: req.query });
  },
);

debugRouter.post(
  "/echo",
  validate({ body: z.object({ name: z.string().min(1) }) }),
  (req, res) => {
    res.json({ ok: true, body: req.body });
  },
);