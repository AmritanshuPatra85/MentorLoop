import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  isKiitEmail,
  KIIT_EMAIL_DOMAIN,
  type AuthUser,
  type LoginInput,
  type RegisterInput,
  type SignupRole,
  type UserStatus,
} from "@mentorloop/shared";
import { env } from "../../config/env";
import { db, type Db } from "../../db/client";
import { refreshTokens, users, type User } from "../../db/schema";
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "../../lib/errors";
import { OAuthFailure, type GoogleProfile } from "./google";
import { hashPassword, verifyDummyPassword, verifyPassword } from "./password";
import { generateRefreshToken, hashToken, signAccessToken } from "./tokens";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type SessionMeta = { userAgent: string | null; ip: string | null };

export type Session = {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthUser;
};

const DAY_MS = 86_400_000;

// Mentors wait for admin approval (Sprint 2.7); founders and everyone else start active.
function initialStatusFor(role: SignupRole): UserStatus {
  return role === "mentor" ? "pending_approval" : "active";
}

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerifiedAt !== null,
    rejectionReason: user.status === "rejected" ? user.rejectionReason : null,
  };
}

function pgErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const e = err as { code?: unknown; cause?: unknown };
  if (typeof e.code === "string") return e.code;
  return pgErrorCode(e.cause);
}

async function issueSession(
  tx: Tx,
  user: User,
  familyId: string,
  meta: SessionMeta,
): Promise<Session> {
  const refreshToken = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);

  await tx.insert(refreshTokens).values({
    userId: user.id,
    familyId,
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshExpiresAt,
    userAgent: meta.userAgent,
    ip: meta.ip,
  });

  const accessToken = await signAccessToken({ id: user.id, role: user.role });
  return { accessToken, refreshToken, refreshExpiresAt, user: toAuthUser(user) };
}

async function revokeFamily(tx: Tx, familyId: string): Promise<void> {
  await tx
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}

export async function register(
  input: RegisterInput,
  meta: SessionMeta,
): Promise<Session> {
  if (input.role === "founder" && !isKiitEmail(input.email)) {
    throw new ValidationError([
      {
        location: "body",
        path: "email",
        message: `Founders must sign up with their @${KIIT_EMAIL_DOMAIN} email`,
      },
    ]);
  }

  const passwordHash = await hashPassword(input.password);
  let session: Session;
  try {
    session = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email: input.email,
          passwordHash,
          fullName: input.fullName,
          role: input.role,
          status: initialStatusFor(input.role),
        })
        .returning();
      if (!user) throw new Error("User insert returned no row");
      return issueSession(tx, user, randomUUID(), meta);
    });
  } catch (err) {
    if (pgErrorCode(err) === "23505") {
      throw new ConflictError("An account with this email already exists");
    }
    throw err;
  }

  return session;
}

export async function login(input: LoginInput, meta: SessionMeta): Promise<Session> {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email}`)
    .limit(1);

  let valid = false;
  if (user?.passwordHash) {
    valid = await verifyPassword(user.passwordHash, input.password);
  } else {
    await verifyDummyPassword(input.password);
  }
  if (!user || !valid) throw new UnauthorizedError("Invalid email or password");
  if (user.status === "suspended")
    throw new ForbiddenError("This account has been suspended");

  return db.transaction((tx) => issueSession(tx, user, randomUUID(), meta));
}

/**
 * Google sign-in / sign-up. `role` is only used when creating a brand-new account
 * (it comes from the signed flow cookie, never from the callback query).
 */
export async function signInWithGoogle(
  profile: GoogleProfile,
  role: SignupRole | undefined,
  meta: SessionMeta,
): Promise<Session> {
  if (!profile.emailVerified) throw new OAuthFailure("email_not_verified");
  const email = profile.email.toLowerCase();

  try {
    return await db.transaction(async (tx) => {
      let [user] = await tx
        .select()
        .from(users)
        .where(eq(users.googleId, profile.sub))
        .limit(1);

      if (!user) {
        const [byEmail] = await tx
          .select()
          .from(users)
          .where(sql`lower(${users.email}) = ${email}`)
          .limit(1);

        if (byEmail) {
          if (byEmail.googleId && byEmail.googleId !== profile.sub) {
            throw new OAuthFailure("google_account_conflict");
          }
          // Google proved ownership of this address, so link the accounts. If the existing
          // account was never email-verified, whoever set its password may not own the
          // address: drop the password and revoke its sessions.
          const wasUnverified = byEmail.emailVerifiedAt === null;
          const [linked] = await tx
            .update(users)
            .set({
              googleId: profile.sub,
              emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
              ...(wasUnverified ? { passwordHash: null } : {}),
            })
            .where(eq(users.id, byEmail.id))
            .returning();
          if (!linked) throw new Error("Google link returned no row");
          if (wasUnverified) {
            await tx
              .update(refreshTokens)
              .set({ revokedAt: new Date() })
              .where(
                and(
                  eq(refreshTokens.userId, byEmail.id),
                  isNull(refreshTokens.revokedAt),
                ),
              );
          }
          user = linked;
        }
      }

      if (!user) {
        if (!role) throw new OAuthFailure("no_account");
        if (role === "founder" && !isKiitEmail(email)) {
          throw new OAuthFailure("founder_requires_kiit");
        }
        const [created] = await tx
          .insert(users)
          .values({
            email,
            emailVerifiedAt: new Date(),
            googleId: profile.sub,
            fullName: profile.name || email.split("@")[0] || "MentorLoop user",
            role,
            status: initialStatusFor(role),
          })
          .returning();
        if (!created) throw new Error("User insert returned no row");
        user = created;
      }

      if (user.status === "suspended") throw new OAuthFailure("account_suspended");
      return issueSession(tx, user, randomUUID(), meta);
    });
  } catch (err) {
    if (pgErrorCode(err) === "23505") throw new OAuthFailure("google_account_conflict");
    throw err;
  }
}

type RefreshOutcome =
  | { kind: "ok"; session: Session }
  | { kind: "invalid" }
  | { kind: "reuse" }
  | { kind: "suspended" };

export async function refresh(rawToken: string, meta: SessionMeta): Promise<Session> {
  const tokenHash = hashToken(rawToken);

  // Outcomes are returned, not thrown, so revocations commit instead of rolling back.
  const outcome = await db.transaction(async (tx): Promise<RefreshOutcome> => {
    // Atomic claim: only one concurrent request can flip used_at from NULL.
    const [claimed] = await tx
      .update(refreshTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          isNull(refreshTokens.usedAt),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      )
      .returning();

    if (claimed) {
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, claimed.userId))
        .limit(1);
      if (!user || user.status === "suspended") {
        await revokeFamily(tx, claimed.familyId);
        return { kind: "suspended" };
      }
      return {
        kind: "ok",
        session: await issueSession(tx, user, claimed.familyId, meta),
      };
    }

    // Not claimable: unknown, expired, revoked, or already used.
    const [existing] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    if (existing?.usedAt) {
      await revokeFamily(tx, existing.familyId);
      return { kind: "reuse" };
    }
    return { kind: "invalid" };
  });

  switch (outcome.kind) {
    case "ok":
      return outcome.session;
    case "suspended":
      throw new ForbiddenError("This account has been suspended");
    case "reuse":
      throw new UnauthorizedError("Session is no longer valid. Please sign in again.");
    case "invalid":
      throw new UnauthorizedError("Invalid or expired refresh token");
  }
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const [existing] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashToken(rawToken)))
    .limit(1);
  if (!existing) return;
  await db.transaction((tx) => revokeFamily(tx, existing.familyId));
}

export async function getMe(userId: string): Promise<AuthUser> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new UnauthorizedError("Account no longer exists");
  if (user.status === "suspended")
    throw new ForbiddenError("This account has been suspended");
  return toAuthUser(user);
}
