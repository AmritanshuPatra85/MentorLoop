import { z } from "zod";
import { userStatusSchema } from "./auth";
import { preferredSessionWindowSchema, timezoneSchema } from "./founder-onboarding";

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional();
const urlOrEmpty = z.union([z.literal(""), z.string().trim().url().max(500)]).optional();

export const mentorOnboardingDraftSchema = z.object({
  currentRole: optionalText(120),
  organization: optionalText(160),
  bio: optionalText(2000),
  experienceSummary: optionalText(2000),
  yearsExperience: z.number().int().min(0).max(60).optional(),
  domainSlugs: z.array(z.string().min(1).max(80)).max(10).optional(),
  skillSlugs: z.array(z.string().min(1).max(80)).max(20).optional(),
  stageSlugs: z.array(z.string().min(1).max(80)).max(5).optional(),
  helpTopics: optionalText(1200),
  maxMentees: z.number().int().min(1).max(20).optional(),
  sessionLengthMinutes: z
    .union([z.literal(30), z.literal(45), z.literal(60), z.literal(90)])
    .optional(),
  timezone: z.union([z.literal(""), timezoneSchema]).optional(),
  preferredSessionTimes: z.array(preferredSessionWindowSchema).max(21).optional(),
  linkedinUrl: urlOrEmpty,
  websiteUrl: urlOrEmpty,
});
export type MentorOnboardingDraft = z.infer<typeof mentorOnboardingDraftSchema>;

export const mentorOnboardingCompleteSchema = mentorOnboardingDraftSchema.extend({
  bio: z.string().trim().min(50).max(2000),
  experienceSummary: z.string().trim().min(20).max(2000),
  domainSlugs: z.array(z.string().min(1)).min(1).max(10),
  skillSlugs: z.array(z.string().min(1)).min(1).max(20),
  stageSlugs: z.array(z.string().min(1)).min(1).max(5),
  helpTopics: z.string().trim().min(10).max(1200),
  maxMentees: z.number().int().min(1).max(20),
  sessionLengthMinutes: z.union([
    z.literal(30),
    z.literal(45),
    z.literal(60),
    z.literal(90),
  ]),
  timezone: timezoneSchema,
  preferredSessionTimes: z
    .array(preferredSessionWindowSchema)
    .min(1, "Add at least one preferred session window before submitting.")
    .max(21),
});
export type MentorOnboardingComplete = z.infer<typeof mentorOnboardingCompleteSchema>;

export const mentorOnboardingProfileSchema = mentorOnboardingDraftSchema.extend({
  mentorName: z.string(),
  email: z.string().email(),
  isComplete: z.boolean(),
  updatedAt: z.string().datetime(),
});
export type MentorOnboardingProfile = z.infer<typeof mentorOnboardingProfileSchema>;
export const mentorOnboardingResponseSchema = z.object({
  profile: mentorOnboardingProfileSchema.nullable(),
});
export const mentorOnboardingSaveResponseSchema = z.object({
  profile: mentorOnboardingProfileSchema,
  status: userStatusSchema,
  rejectionReason: z.string().nullable(),
});
