import { z } from "zod";
import { founderOnboardingDraftSchema } from "./founder-onboarding";
import { mentorOnboardingDraftSchema } from "./mentor-onboarding";
import { signupRoleSchema } from "./auth";

/** Authenticated user's private profile response. Never use this for public profile routes. */
export const myProfileResponseSchema = z.object({
  role: signupRoleSchema,
  avatarUrl: z.string().nullable(),
  publicProfilePath: z.string().nullable().optional(),
  profile: z.record(z.string(), z.unknown()).nullable(),
});
export type MyProfileResponse = z.infer<typeof myProfileResponseSchema>;

const safeProfileUrl = z.union([z.literal(""), z.string().url().max(500)]).optional();

export const founderProfileUpdateSchema = founderOnboardingDraftSchema
  .extend({ linkedinUrl: safeProfileUrl })
  .strict();
export type FounderProfileUpdate = z.infer<typeof founderProfileUpdateSchema>;

export const mentorProfileUpdateSchema = mentorOnboardingDraftSchema
  .extend({ linkedinUrl: safeProfileUrl, websiteUrl: safeProfileUrl })
  .strict();
export type MentorProfileUpdate = z.infer<typeof mentorProfileUpdateSchema>;

export const avatarUploadSchema = z.object({
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  /** Base64 encoded image bytes. Kept small enough for the API's JSON body limit. */
  data: z
    .string()
    .min(1)
    .max(700_000)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
});
const publicImageUrlSchema = z.union([
  z.string().url(),
  z.string().regex(/^\/uploads\/avatars\/[0-9a-f-]{36}\.(?:png|jpg|webp)$/i),
]);
export const avatarResponseSchema = z.object({
  avatarUrl: z.union([publicImageUrlSchema, z.literal("")]),
});

export const publicMentorProfileSchema = z.object({
  name: z.string(),
  avatarUrl: publicImageUrlSchema.nullable(),
  currentRole: z.string().nullable(),
  organization: z.string().nullable(),
  bio: z.string().nullable(),
  experienceSummary: z.string().nullable(),
  yearsExperience: z.number().int().nullable(),
  domains: z.array(z.string()),
  skills: z.array(z.string()),
  mentorshipStages: z.array(z.string()),
  linkedinUrl: z.string().url().nullable(),
  websiteUrl: z.string().url().nullable(),
});
export type PublicMentorProfile = z.infer<typeof publicMentorProfileSchema>;

export const publicStartupProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  avatarUrl: publicImageUrlSchema.nullable(),
  oneLiner: z.string().nullable(),
  description: z.string().nullable(),
  domains: z.array(z.string()),
  stage: z.string().nullable(),
});
export type PublicStartupProfile = z.infer<typeof publicStartupProfileSchema>;
