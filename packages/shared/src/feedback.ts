import { z } from "zod";

export const feedbackTagSchema = z.enum(["communication", "preparedness", "actionable_advice", "domain_expertise", "follow_through", "empathy", "other"]);
export const feedbackVisibilitySchema = z.enum(["public_to_mentor", "admin_private"]);
export const feedbackSubmissionSchema = z.object({
  rating: z.number().int().min(1).max(5),
  tags: z.array(feedbackTagSchema).max(5).refine((tags) => new Set(tags).size === tags.length, "Tags must be unique"),
  comment: z.string().trim().max(2000).optional().default(""),
  visibility: feedbackVisibilitySchema,
}).strict();
export const feedbackSubmitResponseSchema = z.object({ submitted: z.literal(true), created: z.boolean() });
export const feedbackStatusSchema = z.object({ submitted: z.boolean() });
export const publicMentorFeedbackSchema = z.object({ rating: z.number().int().min(1).max(5), tags: z.array(feedbackTagSchema), comment: z.string().nullable(), createdAt: z.string().datetime() });
export const adminFeedbackListSchema = z.object({
  items: z.array(z.object({ id:z.string().uuid(),sessionId:z.string().uuid(),connectionId:z.string().uuid(),authorName:z.string(),authorRole:z.enum(["founder","mentor"]),mentorName:z.string(),rating:z.number().int().min(1).max(5),tags:z.array(feedbackTagSchema),comment:z.string().nullable(),visibility:feedbackVisibilitySchema,createdAt:z.string().datetime() })),
  limit:z.number().int(), offset:z.number().int(),
});
