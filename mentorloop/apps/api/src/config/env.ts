import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL is required" })
    .regex(/^postgres(ql)?:\/\//, "must start with postgres:// or postgresql://"),
  REDIS_URL: z
    .string({ required_error: "REDIS_URL is required" })
    .regex(/^rediss?:\/\//, "must start with redis:// or rediss://"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("\nInvalid environment configuration:\n");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    console.error("\nCopy apps/api/.env.example to apps/api/.env and fix the values above.\n");
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();