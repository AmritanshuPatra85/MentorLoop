import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { userRoleSchema, type UserRole } from "@mentorloop/shared";
import { env } from "../../config/env";
import { UnauthorizedError } from "../../lib/errors";

const ISSUER = "mentorloop";
const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export async function signAccessToken(user: { id: string; role: UserRole }): Promise<string> {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_MINUTES}m`)
    .sign(secret);
}

export async function verifyAccessToken(
  token: string,
): Promise<{ userId: string; role: UserRole }> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: ISSUER,
    });
    const role = userRoleSchema.safeParse(payload.role);
    if (typeof payload.sub !== "string" || !role.success) {
      throw new Error("malformed claims");
    }
    return { userId: payload.sub, role: role.data };
  } catch {
    throw new UnauthorizedError("Invalid or expired access token");
  }
}

// Refresh tokens are opaque 256-bit random values. Only a SHA-256 hash is stored:
// the token is high-entropy, so a fast hash is safe (unlike passwords).
export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}