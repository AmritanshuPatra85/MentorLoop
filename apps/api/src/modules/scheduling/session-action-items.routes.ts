import { Router } from "express";
import {
  sessionActionItemExtractionRequestSchema,
  sessionActionItemExtractionResponseSchema,
  sessionActionItemSaveSchema,
  sessionActionItemFilterSchema,
  sessionActionItemSchema,
  sessionActionItemUpdateSchema,
  sessionActionItemsResponseSchema,
} from "@mentorloop/shared";
import { AppError } from "../../lib/errors";
import { asyncHandler } from "../../lib/async-handler";
import { validate } from "../../middleware/validate";
import {
  getSessionActionItemsContext,
  listSessionActionItems,
  saveSessionActionItems,
  type ReviewedSessionActionItem,
  type SessionActionItemsContext,
  updateSessionActionItem,
  type ActionItemFilters,
} from "./session-action-items.repository";
import { extractSessionActionItems } from "./session-action-items.groq";

type SessionActionItemsRouteDependencies = {
  getContext: (sessionId: string, actorId: string) => Promise<SessionActionItemsContext>;
  list: (sessionId: string, actorId: string, filters?: ActionItemFilters) => ReturnType<typeof listSessionActionItems>;
  update: typeof updateSessionActionItem;
  save: (sessionId: string, actorId: string, submissionId: string, items: ReviewedSessionActionItem[]) => ReturnType<typeof saveSessionActionItems>;
  extract: ((notes: string, context: SessionActionItemsContext) => Promise<unknown>) | null;
};

const productionDependencies: SessionActionItemsRouteDependencies = {
  getContext: getSessionActionItemsContext,
  list: listSessionActionItems,
  update: updateSessionActionItem,
  save: saveSessionActionItems,
  extract: extractSessionActionItems,
};

export function createSessionActionItemsRouter(dependencies: SessionActionItemsRouteDependencies = productionDependencies) {
  const router = Router({ mergeParams: true });

  router.post("/extract", validate({ body: sessionActionItemExtractionRequestSchema }), asyncHandler(async (req, res) => {
    const sessionId = req.params.sessionId!;
    const context = await dependencies.getContext(sessionId, req.auth!.userId);
    if (!dependencies.extract) throw new AppError(503, "GROQ_UNAVAILABLE", "Action item extraction is unavailable. Your notes are still available for manual entry or retry.");
    const body = sessionActionItemExtractionRequestSchema.parse(req.body);
    const actionItems = await dependencies.extract(body.notes, context);
    res.json(sessionActionItemExtractionResponseSchema.parse({ actionItems }));
  }));

  router.get("/", validate({ query: sessionActionItemFilterSchema }), asyncHandler(async (req, res) => {
    const filters = sessionActionItemFilterSchema.parse(req.query);
    const actionItems = await dependencies.list(req.params.sessionId!, req.auth!.userId, filters);
    res.json(sessionActionItemsResponseSchema.parse({ actionItems }));
  }));

  router.patch("/:itemId", validate({ body: sessionActionItemUpdateSchema }), asyncHandler(async (req, res) => {
    const input = sessionActionItemUpdateSchema.parse(req.body);
    const { expectedUpdatedAt, ...fields } = input;
    const actionItem = await dependencies.update(req.params.itemId!, req.auth!.userId, expectedUpdatedAt, fields);
    res.json(sessionActionItemSchema.parse(actionItem));
  }));

  router.post("/", validate({ body: sessionActionItemSaveSchema }), asyncHandler(async (req, res) => {
    const body = sessionActionItemSaveSchema.parse(req.body);
    const actionItems = await dependencies.save(req.params.sessionId!, req.auth!.userId, body.submissionId, body.actionItems);
    res.status(201).json(sessionActionItemsResponseSchema.parse({ actionItems }));
  }));

  return router;
}

export const sessionActionItemsRouter = createSessionActionItemsRouter();
