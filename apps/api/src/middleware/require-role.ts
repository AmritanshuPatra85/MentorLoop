import type { UserRole } from "@mentorloop/shared";
import { asyncHandler } from "../lib/async-handler";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";

/**
 * Role gate. Must run after requireAuth (401 = who are you, 403 = not allowed).
 * Reads the role from the verified JWT, so it costs no database query.
 */
export function requireRole(...roles: UserRole[]) {
  return asyncHandler(async (req, _res, next) => {
    if (!req.auth) throw new UnauthorizedError();
    if (!roles.includes(req.auth.role)) {
      throw new ForbiddenError("Your role cannot access this resource", "ROLE_NOT_ALLOWED");
    }
    next();
  });
}