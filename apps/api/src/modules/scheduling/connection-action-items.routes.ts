import { Router } from "express";
import { connectionActionItemsResponseSchema, sessionActionItemFilterSchema } from "@mentorloop/shared";
import { asyncHandler } from "../../lib/async-handler";
import { validate } from "../../middleware/validate";
import { listConnectionActionItems } from "./session-action-items.repository";

export const connectionActionItemsRouter = Router({ mergeParams: true });

connectionActionItemsRouter.get("/", validate({ query: sessionActionItemFilterSchema }), asyncHandler(async (req, res) => {
  const filters = sessionActionItemFilterSchema.parse(req.query);
  const result = await listConnectionActionItems(req.params.connectionId!, req.auth!.userId, filters);
  res.json(connectionActionItemsResponseSchema.parse(result));
}));
