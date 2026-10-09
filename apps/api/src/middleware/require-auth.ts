import { asyncHandler } from "../lib/async-handler";
import { UnauthorizedError } from "../lib/errors";
import { verifyAccessToken } from "../modules/auth/tokens";

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new UnauthorizedError();
  const token = header.slice("Bearer ".length).trim();
  if (!token) throw new UnauthorizedError();
  req.auth = await verifyAccessToken(token);
  next();
});