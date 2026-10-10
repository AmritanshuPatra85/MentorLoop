import { z } from "zod";

export const connectionStateSchema = z.enum([
  "requested", "invited", "accepted", "declined", "withdrawn", "expired",
]);
export type ConnectionState = z.infer<typeof connectionStateSchema>;

export const createConnectionRequestSchema = z.object({
  startupId: z.string().uuid(),
  mentorId: z.string().uuid(),
  introMessage: z.string().trim().min(20).max(1000),
}).strict();
export const connectionResponseSchema = z.object({
  id: z.string().uuid(), startupId: z.string().uuid(), mentorId: z.string().uuid(),
  initiatedBy: z.string().uuid(), state: connectionStateSchema,
  introMessage: z.string().nullable(),
  startupName: z.string(), mentorName: z.string(),
  mentorAvatarUrl: z.string().nullable(), currentRole: z.string().nullable(), organization: z.string().nullable(),
  createdAt: z.string().datetime(), expiresAt: z.string().datetime().nullable(),
  respondedAt: z.string().datetime().nullable(),
});
export const connectionInboxResponseSchema = z.object({ connections: z.array(connectionResponseSchema) });
export const connectionTransitionSchema = z.object({ action: z.enum(["accept", "decline"]) }).strict();

const wallTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm time");
export const weeklyAvailabilityRuleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: wallTimeSchema,
  endTime: wallTimeSchema,
}).strict().refine((rule) => rule.startTime < rule.endTime, {
  message: "End time must be after start time", path: ["endTime"],
});
export const availabilityUpdateSchema = z.object({
  timezone: z.string().trim().min(1).max(100),
  sessionLengthMinutes: z.number().int().min(15).max(240),
  bufferMinutes: z.number().int().min(0).max(120),
  minimumNoticeMinutes: z.number().int().min(0).max(10080),
  rules: z.array(weeklyAvailabilityRuleSchema).max(42),
}).strict().superRefine(({ rules }, ctx) => {
  for (let i = 0; i < rules.length; i += 1) {
    for (let j = i + 1; j < rules.length; j += 1) {
      const a = rules[i]!; const b = rules[j]!;
      if (a.dayOfWeek === b.dayOfWeek && a.startTime < b.endTime && b.startTime < a.endTime) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rules", j], message: "Availability windows on the same day cannot overlap" });
      }
    }
  }
});
export const availabilityResponseSchema = z.object({
  timezone: z.string(), sessionLengthMinutes: z.number().int(), bufferMinutes: z.number().int(), minimumNoticeMinutes: z.number().int(),
  rules: z.array(z.object({ id: z.string().uuid(), dayOfWeek: z.number().int(), startTime: z.string(), endTime: z.string() })),
  exceptions: z.array(z.object({ id: z.string().uuid(), startsAt: z.string().datetime(), endsAt: z.string().datetime() })),
});
export const availabilityExceptionInputSchema = z.object({
  startsAt: z.string().datetime(), endsAt: z.string().datetime(),
}).strict().refine(({ startsAt, endsAt }) => Date.parse(startsAt) < Date.parse(endsAt), {
  message: "End must be after start", path: ["endsAt"],
});
export const availableSlotsResponseSchema = z.object({
  timezone: z.string(), slots: z.array(z.object({ startsAt: z.string().datetime(), endsAt: z.string().datetime() })),
});
export const slotRangeQuerySchema = z.object({ from: z.string().datetime(), to: z.string().datetime(), timezone: z.string().min(1).max(100) }).strict();

export const bookSessionSchema = z.object({
  connectionId: z.string().uuid(),
  startsAt: z.string().datetime(),
  meetingUrl: z.string().url().max(2000).refine((value) => value.startsWith("https://"), "Use a secure https meeting link"),
  idempotencyKey: z.string().uuid(),
}).strict();
export const rescheduleSessionSchema = z.object({
  startsAt: z.string().datetime(), reason: z.string().trim().min(3).max(1000),
  meetingUrl: z.string().url().max(2000).refine((value) => value.startsWith("https://"), "Use a secure https meeting link").optional(),
}).strict();
export const sessionActionSchema = z.object({ action: z.enum(["cancel", "complete", "no_show"]), reason: z.string().trim().min(3).max(1000).optional() }).strict().superRefine(({ action, reason }, ctx) => {
  if ((action === "cancel" || action === "no_show") && !reason) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "A reason is required for this action" });
});
export const meetingLinkSchema = z.object({ meetingUrl: z.string().url().max(2000).refine((value) => value.startsWith("https://"), "Use a secure https meeting link") }).strict();

export const sessionSchema = z.object({
  id: z.string().uuid(), connectionId: z.string().uuid(), mentorId: z.string().uuid(), startupId: z.string().uuid(),
  status: z.enum(["scheduled", "rescheduled", "cancelled", "completed", "no_show"]),
  startsAt: z.string().datetime(), endsAt: z.string().datetime(), mentorTimezone: z.string(), meetingUrl: z.string().url().nullable(),
  startupName: z.string(), mentorName: z.string(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export const sessionHistorySchema = z.object({
  id: z.string().uuid(), eventType: z.enum(["created", "rescheduled", "cancelled", "completed", "no_show", "meeting_link_updated"]),
  fromStatus: z.enum(["scheduled", "rescheduled", "cancelled", "completed", "no_show"]).nullable(),
  toStatus: z.enum(["scheduled", "rescheduled", "cancelled", "completed", "no_show"]).nullable(),
  oldStartsAt: z.string().datetime().nullable(), oldEndsAt: z.string().datetime().nullable(),
  newStartsAt: z.string().datetime().nullable(), newEndsAt: z.string().datetime().nullable(),
  reason: z.string().nullable(), actorName: z.string().nullable(), createdAt: z.string().datetime(),
});
export const sessionDetailResponseSchema = z.object({ session: sessionSchema, history: z.array(sessionHistorySchema) });
export const sessionListResponseSchema = z.object({ sessions: z.array(sessionSchema) });
export const calendarConnectionResponseSchema = z.object({ connected: z.boolean() });
export const googleConnectUrlResponseSchema = z.object({ authorizationUrl: z.string().url() });
export const googleCalendarEventResponseSchema = z.object({ calendarUrl: z.string().url().nullable(), meetingUrl: z.string().url().nullable() });
