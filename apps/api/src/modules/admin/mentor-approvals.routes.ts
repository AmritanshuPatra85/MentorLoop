import { Router } from "express";
import {
  adminMentorApprovalQueueSchema,
  adminMentorDecisionResponseSchema,
  mentorRejectionSchema,
} from "@mentorloop/shared";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler";
import { requireAuth } from "../../middleware/require-auth";
import { requireAdmin } from "../../middleware/require-admin";
import { validate } from "../../middleware/validate";
import {
  decideMentorApplication,
  listPendingMentorApplications,
} from "./mentor-approvals.service";

const mentorParamsSchema = z.object({ mentorId: z.string().uuid() });

export const mentorApprovalsRouter = Router();
mentorApprovalsRouter.use(requireAuth, requireAdmin);

mentorApprovalsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(adminMentorApprovalQueueSchema.parse(await listPendingMentorApplications()));
  }),
);

mentorApprovalsRouter.post(
  "/:mentorId/approve",
  validate({ params: mentorParamsSchema }),
  asyncHandler(async (req, res) => {
    const { mentorId } = req.params as z.infer<typeof mentorParamsSchema>;
    const result = await decideMentorApplication(mentorId, "approve");
    res.json(adminMentorDecisionResponseSchema.parse(result));
  }),
);

mentorApprovalsRouter.post(
  "/:mentorId/reject",
  validate({ params: mentorParamsSchema, body: mentorRejectionSchema }),
  asyncHandler(async (req, res) => {
    const { mentorId } = req.params as z.infer<typeof mentorParamsSchema>;
    const { reason } = req.body as z.infer<typeof mentorRejectionSchema>;
    const result = await decideMentorApplication(mentorId, "reject", reason);
    res.json(adminMentorDecisionResponseSchema.parse(result));
  }),
);
