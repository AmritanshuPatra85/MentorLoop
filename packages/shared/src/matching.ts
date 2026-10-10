import { z } from "zod";

export const matchingWeightsSchema = z.object({
  semanticSimilarity: z.number().finite().min(0).max(100),
  domainOverlap: z.number().finite().min(0).max(100),
  stageFit: z.number().finite().min(0).max(100),
  availabilityOverlap: z.number().finite().min(0).max(100),
  trackRecord: z.number().finite().min(0).max(100),
}).strict().refine((weights) => Math.abs(Object.values(weights).reduce((sum, value) => sum + value, 0) - 100) < 0.0001, {
  message: "Matching weights must total 100",
});
export type MatchingWeights = z.infer<typeof matchingWeightsSchema>;

export const matchingSignalSchema = z.object({ raw: z.number().min(0).max(1), weight: z.number().min(0).max(100), weighted: z.number().min(0).max(1) });
export const matchResultSchema = z.object({
  candidateId: z.string().uuid(), score: z.number().min(0).max(1),
  signals: z.object({ semanticSimilarity: matchingSignalSchema, domainOverlap: matchingSignalSchema, stageFit: matchingSignalSchema, availabilityOverlap: matchingSignalSchema, trackRecord: matchingSignalSchema }),
  newMentorBoost: z.number().min(0).max(1),
});
export const matchingResponseSchema = z.object({ matches: z.array(matchResultSchema).max(50) });
export const matchExplanationSchema = z.object({ text: z.string().min(1), source: z.enum(["groq", "template"]) });
export type MatchExplanation = z.infer<typeof matchExplanationSchema>;
export const matchResultWithExplanationSchema = matchResultSchema.extend({
  saved: z.boolean(),
  explanation: matchExplanationSchema,
  mentor: z.object({
    id: z.string().uuid(),
    name: z.string(),
    avatarUrl: z.string().nullable(),
    currentRole: z.string().nullable(),
    organization: z.string().nullable(),
    bio: z.string().nullable(),
    experienceSummary: z.string().nullable(),
    yearsExperience: z.number().int().nullable(),
    domains: z.array(z.string()),
    skills: z.array(z.string()),
    mentorshipStages: z.array(z.string()),
  }),
});
export type MatchResultWithExplanation = z.infer<typeof matchResultWithExplanationSchema>;
export const matchingWithExplanationsResponseSchema = z.object({ matches: z.array(matchResultWithExplanationSchema).max(50) });
export const matchResultWithStartupSchema = matchResultSchema.extend({
  saved: z.boolean(),
  startup: z.object({
    id: z.string().uuid(), name: z.string(), avatarUrl: z.string().nullable(),
    oneLiner: z.string().nullable(), description: z.string().nullable(),
    domains: z.array(z.string()), stage: z.string().nullable(),
  }),
});
export const matchingWithStartupsResponseSchema = z.object({ matches: z.array(matchResultWithStartupSchema).max(50) });
export type MatchResultWithStartup = z.infer<typeof matchResultWithStartupSchema>;
export const createConnectionInviteSchema = z.object({
  startupId: z.string().uuid(),
  introMessage: z.string().trim().min(20).max(1000),
}).strict();
export type CreateConnectionInviteInput = z.infer<typeof createConnectionInviteSchema>;
export const connectionInviteResponseSchema = z.object({
  id: z.string().uuid(), startupId: z.string().uuid(), mentorId: z.string().uuid(),
  state: z.literal("invited"), introMessage: z.string(), createdAt: z.string().datetime(), expiresAt: z.string().datetime(),
});
export const incomingConnectionInvitesResponseSchema = z.object({
  invites: z.array(z.object({
    id: z.string().uuid(), startupId: z.string().uuid(), mentorId: z.string().uuid(),
    mentorName: z.string(), avatarUrl: z.string().nullable(), currentRole: z.string().nullable(),
    organization: z.string().nullable(), introMessage: z.string().nullable(), state: z.literal("invited"),
    sentAt: z.string().datetime(), expiresAt: z.string().datetime(),
  })),
});
export const matchCandidateTypeSchema = z.enum(["mentor", "startup"]);
export const matchInteractionEventTypeSchema = z.enum(["view", "save", "dismiss"]);
export const matchEventActionSchema = z.object({
  eventType: matchInteractionEventTypeSchema,
  dismissalReason: z.string().trim().max(500).optional().refine((reason) => !reason || reason.length >= 3, "Enter at least 3 characters for a dismissal reason"),
}).strict().refine((action) => action.eventType === "dismiss" || action.dismissalReason === undefined, {
  message: "A dismissal reason is only valid for dismiss events", path: ["dismissalReason"],
});
export const matchEventActionResponseSchema = z.object({
  eventId: z.string().uuid().nullable(), candidateType: matchCandidateTypeSchema,
  candidateId: z.string().uuid(), eventType: z.enum(["view", "save", "dismiss", "request"]),
  recorded: z.boolean(),
});
export const matchingWeightsResponseSchema = z.object({ weights: matchingWeightsSchema });
export type MatchResult = z.infer<typeof matchResultSchema>;
