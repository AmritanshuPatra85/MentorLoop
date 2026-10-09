import { Router } from "express";
import {
  mentorOnboardingCompleteSchema,
  mentorOnboardingDraftSchema,
  mentorOnboardingResponseSchema,
  mentorOnboardingSaveResponseSchema,
  type MentorOnboardingComplete,
  type MentorOnboardingDraft,
} from "@mentorloop/shared";
import { asyncHandler } from "../../lib/async-handler";
import { requireAuth } from "../../middleware/require-auth";
import { requireMentorOnboarding } from "../../middleware/require-mentor-onboarding";
import { validate } from "../../middleware/validate";
import { getMentorOnboarding, saveMentorOnboarding } from "./mentor-onboarding.service";

export const mentorOnboardingRouter = Router();
mentorOnboardingRouter.use(requireAuth, requireMentorOnboarding);

mentorOnboardingRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(
      mentorOnboardingResponseSchema.parse(await getMentorOnboarding(req.auth!.userId)),
    );
  }),
);

mentorOnboardingRouter.put(
  "/draft",
  validate({ body: mentorOnboardingDraftSchema }),
  asyncHandler(async (req, res) => {
    const result = await saveMentorOnboarding(
      req.auth!.userId,
      req.body as MentorOnboardingDraft,
      false,
    );
    res.json(mentorOnboardingSaveResponseSchema.parse(result));
  }),
);

mentorOnboardingRouter.post(
  "/complete",
  validate({ body: mentorOnboardingCompleteSchema }),
  asyncHandler(async (req, res) => {
    const result = await saveMentorOnboarding(
      req.auth!.userId,
      req.body as MentorOnboardingComplete,
      true,
    );
    res.json(mentorOnboardingSaveResponseSchema.parse(result));
  }),
);
