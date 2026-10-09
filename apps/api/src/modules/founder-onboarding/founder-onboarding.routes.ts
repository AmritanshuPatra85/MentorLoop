import { Router } from "express";
import {
  founderOnboardingCompleteSchema,
  founderOnboardingDraftSchema,
  founderOnboardingSaveResponseSchema,
  founderOnboardingResponseSchema,
  type FounderOnboardingComplete,
  type FounderOnboardingDraft,
} from "@mentorloop/shared";
import { asyncHandler } from "../../lib/async-handler";
import { requireApproved } from "../../middleware/require-approved";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { validate } from "../../middleware/validate";
import {
  getFounderOnboarding,
  saveFounderOnboarding,
} from "./founder-onboarding.service";

export const founderOnboardingRouter = Router();
founderOnboardingRouter.use(requireAuth, requireRole("founder"), requireApproved);

founderOnboardingRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const result = await getFounderOnboarding(req.auth!.userId);
    res.json(founderOnboardingResponseSchema.parse(result));
  }),
);

founderOnboardingRouter.put(
  "/draft",
  validate({ body: founderOnboardingDraftSchema }),
  asyncHandler(async (req, res) => {
    const profile = await saveFounderOnboarding(
      req.auth!.userId,
      req.body as FounderOnboardingDraft,
      false,
    );
    res.json(founderOnboardingSaveResponseSchema.parse({ profile }));
  }),
);

founderOnboardingRouter.post(
  "/complete",
  validate({ body: founderOnboardingCompleteSchema }),
  asyncHandler(async (req, res) => {
    const profile = await saveFounderOnboarding(
      req.auth!.userId,
      req.body as FounderOnboardingComplete,
      true,
    );
    res.json(founderOnboardingSaveResponseSchema.parse({ profile }));
  }),
);
