import { z } from "zod";

const checkSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number(),
  error: z.string().optional(),
});

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  uptimeSeconds: z.number(),
  time: z.string().datetime(),
  checks: z.object({
    postgres: checkSchema,
    redis: checkSchema,
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;