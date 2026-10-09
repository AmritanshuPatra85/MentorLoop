import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import type { CodeRequestResponse } from "@mentorloop/shared";
import { env } from "../../config/env";
import { db } from "../../db/client";
import { emailVerifications, users } from "../../db/schema";
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "../../lib/errors";
import { sendEmail } from "../../lib/mailer";

export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function hashCode(userId: string, code: string): string {
  return createHmac("sha256", env.JWT_ACCESS_SECRET)
    .update(`email-otp:${userId}:${code}`)
    .digest("hex");
}

function codesMatch(expectedHash: string, actualHash: string): boolean {
  const a = Buffer.from(expectedHash, "hex");
  const b = Buffer.from(actualHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function codeError(message: string): ValidationError {
  return new ValidationError([{ location: "body", path: "code", message }]);
}

export async function requestVerificationCode(userId: string): Promise<CodeRequestResponse> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new UnauthorizedError("Account no longer exists");
  if (user.status === "suspended") throw new ForbiddenError("This account has been suspended");
  if (user.emailVerifiedAt) throw new ConflictError("Your email is already verified");

  const [latest] = await db
    .select()
    .from(emailVerifications)
    .where(eq(emailVerifications.userId, userId))
    .orderBy(desc(emailVerifications.createdAt))
    .limit(1);

  if (latest) {
    const waitMs = latest.createdAt.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000 - Date.now();
    if (waitMs > 0) {
      throw new ConflictError(
        `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another code`,
      );
    }
  }

  const code = generateCode();
  const now = new Date();

  await db.transaction(async (tx) => {
    // Only the newest code is ever valid.
    await tx
      .update(emailVerifications)
      .set({ consumedAt: now })
      .where(and(eq(emailVerifications.userId, userId), isNull(emailVerifications.consumedAt)));
    await tx.insert(emailVerifications).values({
      userId,
      email: user.email,
      codeHash: hashCode(userId, code),
      expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
    });
  });

  await sendEmail({
    to: user.email,
    subject: "Your MentorLoop verification code",
    text:
      `Hi ${user.fullName},\n\n` +
      `Your MentorLoop verification code is: ${code}\n\n` +
      `It expires in ${OTP_TTL_SECONDS / 60} minutes. If you did not request it, ignore this email.`,
  });

  return {
    expiresInSeconds: OTP_TTL_SECONDS,
    resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    // Console mailer only — echo the OTP so local verify UI does not depend on grepping logs.
    ...(env.NODE_ENV === "development" ? { devCode: code } : {}),
  };
}

export async function confirmVerificationCode(userId: string, code: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new UnauthorizedError("Account no longer exists");
  if (user.emailVerifiedAt) return; // idempotent

  const [latest] = await db
    .select()
    .from(emailVerifications)
    .where(and(eq(emailVerifications.userId, userId), isNull(emailVerifications.consumedAt)))
    .orderBy(desc(emailVerifications.createdAt))
    .limit(1);

  const now = new Date();
  if (
    !latest ||
    latest.expiresAt <= now ||
    latest.email.toLowerCase() !== user.email.toLowerCase()
  ) {
    throw codeError("That code has expired. Request a new one.");
  }

  // Atomic attempt counter: parallel guesses cannot exceed the cap.
  const [claimed] = await db
    .update(emailVerifications)
    .set({ attempts: sql`${emailVerifications.attempts} + 1` })
    .where(
      and(
        eq(emailVerifications.id, latest.id),
        isNull(emailVerifications.consumedAt),
        lt(emailVerifications.attempts, OTP_MAX_ATTEMPTS),
      ),
    )
    .returning();
  if (!claimed) throw new ForbiddenError("Too many incorrect attempts. Request a new code.");

  if (!codesMatch(claimed.codeHash, hashCode(userId, code))) {
    const remaining = OTP_MAX_ATTEMPTS - claimed.attempts;
    throw codeError(
      remaining > 0
        ? `Incorrect code. ${remaining} ${remaining === 1 ? "attempt" : "attempts"} left.`
        : "Incorrect code. Request a new one.",
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(emailVerifications)
      .set({ consumedAt: now })
      .where(eq(emailVerifications.id, claimed.id));
    await tx
      .update(users)
      .set({ emailVerifiedAt: now })
      .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
  });
}