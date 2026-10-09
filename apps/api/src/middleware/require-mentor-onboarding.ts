import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { asyncHandler } from "../lib/async-handler";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";

/** Allows verified mentors to finish onboarding while their account is pending review. */
export const requireMentorOnboarding = asyncHandler(async (req, _res, next) => {
  if (!req.auth) throw new UnauthorizedError();
  const [user] = await db
    .select({
      role: users.role,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, req.auth.userId))
    .limit(1);
  if (!user) throw new UnauthorizedError("Account no longer exists");
  if (user.role !== "mentor") {
    throw new ForbiddenError(
      "Only mentors can access mentor onboarding",
      "ROLE_NOT_ALLOWED",
    );
  }
  if (!user.emailVerifiedAt) {
    throw new ForbiddenError("Please verify your email first", "EMAIL_NOT_VERIFIED");
  }
  if (user.status === "suspended") {
    throw new ForbiddenError("This account has been suspended", "ACCOUNT_SUSPENDED");
  }
  if (user.status === "active") {
    throw new ForbiddenError(
      "Mentor onboarding is already complete",
      "ONBOARDING_ALREADY_COMPLETE",
    );
  }
  next();
});
