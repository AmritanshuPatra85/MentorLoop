import "dotenv/config";
import { z } from "zod";

// Empty values in .env (KEY=) are treated as "not set".
const optionalString = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  API_URL: z.string().url().default("http://localhost:4000"),
  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL is required" })
    .regex(/^postgres(ql)?:\/\//, "must start with postgres:// or postgresql://"),
  REDIS_URL: z
    .string({ required_error: "REDIS_URL is required" })
    .regex(/^rediss?:\/\//, "must start with redis:// or rediss://"),
  JWT_ACCESS_SECRET: z
    .string({ required_error: "JWT_ACCESS_SECRET is required" })
    .min(32, "must be at least 32 characters"),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  // Google sign-in is optional: without these the Google button reports "not configured".
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
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