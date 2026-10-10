import { z } from "zod";

export const KIIT_EMAIL_DOMAIN = "kiit.ac.in";

/** True only for an exact @kiit.ac.in address (no subdomains, no lookalikes). */
export function isKiitEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  return at > 0 && e.slice(at + 1) === KIIT_EMAIL_DOMAIN;
}

export const userRoleSchema = z.enum(["founder", "mentor", "admin"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userStatusSchema = z.enum([
  "active",
  "pending_approval",
  "rejected",
  "suspended",
]);
export type UserStatus = z.infer<typeof userStatusSchema>;

// Roles a person may pick for themselves at signup. Admin is never self-service.
export const signupRoleSchema = z.enum(["founder", "mentor"]);
export type SignupRole = z.infer<typeof signupRoleSchema>;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email")
  .max(254);

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters");

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(100),
  email: emailSchema,
  password: passwordSchema,
  role: signupRoleSchema,
}).superRefine(({ email, role }, ctx) => {
  if (role === "founder" && !isKiitEmail(email)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["email"],
      message: `Founder accounts require an @${KIIT_EMAIL_DOMAIN} email`,
    });
  }
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  role: userRoleSchema,
  status: userStatusSchema,
  emailVerified: z.boolean(),
  rejectionReason: z.string().nullable(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: authUserSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const meResponseSchema = z.object({ user: authUserSchema });
export type MeResponse = z.infer<typeof meResponseSchema>;

// ---- Email verification (OTP) ----
export const verifyEmailSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const codeRequestResponseSchema = z.object({
  expiresInSeconds: z.number().int(),
  resendAfterSeconds: z.number().int(),
  /** Present only when the API runs with NODE_ENV=development (console mailer). */
  devCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
export type CodeRequestResponse = z.infer<typeof codeRequestResponseSchema>;

// ---- Google OAuth ----
// The API redirects the browser to /login?error=<code> or /register?error=<code>.
export const oauthErrorCodeSchema = z.enum([
  "not_configured",
  "access_denied",
  "invalid_state",
  "google_failed",
  "email_not_verified",
  "no_account",
  "founder_requires_kiit",
  "account_suspended",
  "google_account_conflict",
]);
export type OAuthErrorCode = z.infer<typeof oauthErrorCodeSchema>;
