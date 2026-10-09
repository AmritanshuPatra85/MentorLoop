import { z } from "zod";

export const pingResponseSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
  time: z.string().datetime(),
});

export type PingResponse = z.infer<typeof pingResponseSchema>;