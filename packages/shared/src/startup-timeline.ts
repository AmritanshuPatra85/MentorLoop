import { z } from "zod";

export const milestoneStatusSchema=z.enum(["planned","achieved","cancelled"]);
const milestoneDateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value)=>{const date=new Date(`${value}T00:00:00Z`);return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;},"Enter a valid calendar date");
const milestoneFields={title:z.string().trim().min(1).max(160),description:z.string().trim().max(2000).nullable().optional(),milestoneDate:milestoneDateSchema,status:milestoneStatusSchema,relatedSessionId:z.string().uuid().nullable().optional()};
export const startupMilestoneInputSchema=z.object(milestoneFields).strict();
export const startupMilestoneUpdateSchema=startupMilestoneInputSchema;
export const stageProgressionRequestSchema=z.object({stageId:z.string().uuid()}).strict();
export const timelineMilestoneSchema=z.object({id:z.string().uuid(),startupId:z.string().uuid(),title:z.string(),description:z.string().nullable(),milestoneDate:milestoneDateSchema,status:milestoneStatusSchema,relatedSessionId:z.string().uuid().nullable(),createdAt:z.string().datetime(),updatedAt:z.string().datetime()});
export const stageOptionSchema=z.object({id:z.string().uuid(),name:z.string(),displayOrder:z.number().int()});
export const founderTimelineEventSchema=z.discriminatedUnion("type",[
 z.object({id:z.string().uuid(),type:z.literal("milestone"),title:z.string(),description:z.string().nullable(),occurredAt:z.string(),status:milestoneStatusSchema,sessionId:z.string().uuid().nullable(),href:z.string().nullable()}),
 z.object({id:z.string().uuid(),type:z.literal("session"),title:z.string(),description:z.string().nullable(),occurredAt:z.string().datetime(),status:z.enum(["scheduled","rescheduled","cancelled","completed","no_show"]),sessionId:z.string().uuid(),href:z.string()}),
 z.object({id:z.string().uuid(),type:z.literal("stage"),title:z.string(),description:z.string().nullable(),occurredAt:z.string().datetime(),status:z.literal("achieved"),sessionId:z.null(),href:z.null()}),
]);
export const founderTimelineResponseSchema=z.object({startup:z.object({id:z.string().uuid(),name:z.string().nullable(),stageId:z.string().uuid().nullable()}),stageOptions:z.array(stageOptionSchema),milestones:z.array(timelineMilestoneSchema),events:z.array(founderTimelineEventSchema)});
export const connectionTimelineResponseSchema=z.object({events:z.array(founderTimelineEventSchema)});
export const stageProgressionResponseSchema=z.object({previousStage:stageOptionSchema.nullable(),stage:stageOptionSchema,changed:z.boolean(),changedAt:z.string().datetime()});
export type StartupMilestoneInput=z.infer<typeof startupMilestoneInputSchema>;
