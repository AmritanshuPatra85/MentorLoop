import { z } from "zod";
import { preferredSessionWindowSchema } from "./founder-onboarding";
import { userStatusSchema } from "./auth";

export const mentorRejectionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Enter a meaningful reason of at least 10 characters.")
    .max(1000, "Keep the rejection reason under 1000 characters."),
});
export type MentorRejection = z.infer<typeof mentorRejectionSchema>;

export const adminMentorApplicationSchema = z.object({
  mentorId: z.string().uuid(),
  fullName: z.string(),
  email: z.string().email(),
  status: userStatusSchema,
  rejectionReason: z.string().nullable(),
  submittedAt: z.string().datetime(),
  currentRole: z.string(),
  organization: z.string(),
  yearsExperience: z.number().int().nullable(),
  bio: z.string(),
  experienceSummary: z.string(),
  domainNames: z.array(z.string()),
  skillNames: z.array(z.string()),
  stageNames: z.array(z.string()),
  helpTopics: z.string(),
  maxMentees: z.number().int().nullable(),
  sessionLengthMinutes: z.number().int().nullable(),
  timezone: z.string(),
  preferredSessionTimes: z.array(preferredSessionWindowSchema),
  linkedinUrl: z.string(),
  websiteUrl: z.string(),
});
export type AdminMentorApplication = z.infer<typeof adminMentorApplicationSchema>;

export const adminMentorApprovalQueueSchema = z.object({
  applications: z.array(adminMentorApplicationSchema),
});

export const adminMentorDecisionResponseSchema = z.object({
  mentorId: z.string().uuid(),
  status: userStatusSchema,
  rejectionReason: z.string().nullable(),
});
