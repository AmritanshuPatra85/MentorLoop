import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { asyncHandler } from "../lib/async-handler";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";

/**
 * Account gate. Must run after requireAuth. Reads status from the database on purpose:
 * the JWT cannot know that an admin just approved, rejected or suspended someone.
 * Each failure has its own error code so the web app can show the right screen.
 */
export const requireApproved = asyncHandler(async (req, _res, next) => {
  if (!req.auth) throw new UnauthorizedError();

  const [user] = await db
    .select({ status: users.status, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, req.auth.userId))
    .limit(1);
  if (!user) throw new UnauthorizedError("Account no longer exists");

  if (user.status === "suspended") {
    throw new ForbiddenError("This account has been suspended", "ACCOUNT_SUSPENDED");
  }
  if (!user.emailVerifiedAt) {
    throw new ForbiddenError("Please verify your email first", "EMAIL_NOT_VERIFIED");
  }
  if (user.status === "pending_approval") {
    throw new ForbiddenError("Your account is awaiting approval", "ACCOUNT_PENDING_APPROVAL");
  }
  if (user.status === "rejected") {
    throw new ForbiddenError("Your application was not approved", "ACCOUNT_REJECTED");
  }
  next();
});