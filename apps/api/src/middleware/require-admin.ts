import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";
import { asyncHandler } from "../lib/async-handler";

/** Uses the database as the authority so stale or forged JWT role claims cannot grant admin access. */
export const requireAdmin = asyncHandler(async (req, _res, next) => {
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
  if (user.role !== "admin" || user.status !== "active" || !user.emailVerifiedAt) {
    throw new ForbiddenError("Administrator access is required", "ADMIN_REQUIRED");
  }
  next();
});
