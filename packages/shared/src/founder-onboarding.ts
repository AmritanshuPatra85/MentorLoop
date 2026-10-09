import { z } from "zod";

export const preferredSessionWindowSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .refine((window) => window.end > window.start, {
    message: "End time must be after start time",
    path: ["end"],
  });

const text = (max: number) => z.string().trim().max(max);
export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((timezone) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }, "Enter a valid timezone, such as Asia/Kolkata");
export const founderOnboardingDraftSchema = z.object({
  founderTitle: text(100).optional(),
  linkedinUrl: z.union([z.literal(""), z.string().trim().url().max(500)]).optional(),
  startupName: text(120).optional(),
  oneLiner: text(180).optional(),
  description: text(3000).optional(),
  domainSlugs: z.array(z.string().min(1).max(80)).max(5).optional(),
  primaryDomainSlug: z.string().max(80).optional(),
  stageSlug: z.string().max(80).optional(),
  helpNeeded: text(2000).optional(),
  goals: text(2000).optional(),
  timezone: timezoneSchema.optional(),
  preferredSessionTimes: z.array(preferredSessionWindowSchema).max(21).optional(),
});
export type FounderOnboardingDraft = z.infer<typeof founderOnboardingDraftSchema>;

export const founderOnboardingCompleteSchema = founderOnboardingDraftSchema
  .extend({
    startupName: z.string().trim().min(2).max(120),
    oneLiner: z.string().trim().min(10).max(180),
    description: z.string().trim().min(30).max(3000),
    domainSlugs: z.array(z.string().min(1)).min(1).max(5),
    primaryDomainSlug: z.string().min(1),
    stageSlug: z.string().min(1),
    helpNeeded: z.string().trim().min(10).max(2000),
    goals: z.string().trim().min(10).max(2000),
    timezone: timezoneSchema,
    preferredSessionTimes: z.array(preferredSessionWindowSchema).min(1).max(21),
  })
  .refine((value) => value.domainSlugs.includes(value.primaryDomainSlug), {
    message: "Choose the primary domain from your selected domains",
    path: ["primaryDomainSlug"],
  });
export type FounderOnboardingComplete = z.infer<typeof founderOnboardingCompleteSchema>;

export const founderOnboardingProfileSchema = founderOnboardingDraftSchema.extend({
  founderName: z.string(),
  email: z.string().email(),
  isComplete: z.boolean(),
  updatedAt: z.string().datetime(),
});
export type FounderOnboardingProfile = z.infer<typeof founderOnboardingProfileSchema>;
export const founderOnboardingResponseSchema = z.object({
  profile: founderOnboardingProfileSchema.nullable(),
});
export const founderOnboardingSaveResponseSchema = z.object({
  profile: founderOnboardingProfileSchema,
});
