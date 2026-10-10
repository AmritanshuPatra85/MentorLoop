import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { calendarConnectionResponseSchema, googleConnectUrlResponseSchema } from "@mentorloop/shared";
import { env } from "../../config/env";
import { db, pool } from "../../db/client";
import { googleCalendarAccounts } from "../../db/schema";
import { asyncHandler } from "../../lib/async-handler";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { requireApproved } from "../../middleware/require-approved";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { validate } from "../../middleware/validate";
import { createGoogleCalendarEvent, encryptGoogleRefreshToken, exchangeGoogleCalendarCode, googleCalendarRedirectUri } from "./calendar-google.service";

export const calendarRouter = Router();
const FLOW_COOKIE = "ml_calendar_oauth";
const FLOW_ISSUER = "mentorloop:calendar-oauth";
const FLOW_SECRET = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const FLOW_TTL_SECONDS = 600;
const CALLBACK_QUERY = z.object({ code: z.string().min(1).optional(), state: z.string().min(1).optional(), error: z.string().optional() });

function cookieOptions() {
  return { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax" as const,
    path: "/calendar/google", maxAge: FLOW_TTL_SECONDS * 1000 };
}

calendarRouter.post("/google/connect", requireAuth, requireApproved, requireRole("founder", "mentor"), asyncHandler(async (req, res) => {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const flow = await new SignJWT({ state, verifier })
    .setProtectedHeader({ alg: "HS256" }).setIssuer(FLOW_ISSUER).setSubject(req.auth!.userId)
    .setIssuedAt().setExpirationTime(FLOW_TTL_SECONDS + "s").sign(FLOW_SECRET);
  res.cookie(FLOW_COOKIE, flow, cookieOptions());
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? "", redirect_uri: googleCalendarRedirectUri(), response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events", state, code_challenge: challenge,
    code_challenge_method: "S256", access_type: "offline", prompt: "consent", include_granted_scopes: "true",
  });
  res.json(googleConnectUrlResponseSchema.parse({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString() }));
}));

calendarRouter.get("/google/callback", validate({ query: CALLBACK_QUERY }), asyncHandler(async (req, res) => {
  const url = new URL("/sessions", env.WEB_URL);
  const query = CALLBACK_QUERY.parse(req.query);
  const flowCookie = req.cookies?.[FLOW_COOKIE] as string | undefined;
  res.clearCookie(FLOW_COOKIE, cookieOptions());
  try {
    if (!flowCookie || !query.state || !query.code || query.error) throw new Error("OAuth flow was cancelled or incomplete");
    const { payload } = await jwtVerify(flowCookie, FLOW_SECRET, { algorithms: ["HS256"], issuer: FLOW_ISSUER });
    if (payload.state !== query.state || typeof payload.sub !== "string" || typeof payload.verifier !== "string") throw new Error("OAuth state was invalid");
    const result = await exchangeGoogleCalendarCode(query.code, payload.verifier);
    const [current] = await db.select().from(googleCalendarAccounts).where(eq(googleCalendarAccounts.userId, payload.sub)).limit(1);
    const refreshToken = result.refreshToken;
    if (!refreshToken && !current) throw new Error("Google did not provide offline access; reconnect and grant consent");
    await db.insert(googleCalendarAccounts).values({
      userId: payload.sub,
      encryptedRefreshToken: refreshToken ? encryptGoogleRefreshToken(refreshToken) : current!.encryptedRefreshToken,
      scopes: result.scopes,
    }).onConflictDoUpdate({ target: googleCalendarAccounts.userId, set: {
      ...(refreshToken ? { encryptedRefreshToken: encryptGoogleRefreshToken(refreshToken) } : {}),
      scopes: result.scopes, updatedAt: new Date(),
    } });
    url.searchParams.set("calendar", "connected");
  } catch {
    url.searchParams.set("calendar", "error");
  }
  res.redirect(url.toString());
}));

calendarRouter.get("/google/status", requireAuth, requireApproved, requireRole("founder", "mentor"), asyncHandler(async (req, res) => {
  const [account] = await db.select({ userId: googleCalendarAccounts.userId }).from(googleCalendarAccounts)
    .where(eq(googleCalendarAccounts.userId, req.auth!.userId)).limit(1);
  res.json(calendarConnectionResponseSchema.parse({ connected: Boolean(account) }));
}));

calendarRouter.delete("/google", requireAuth, requireApproved, requireRole("founder", "mentor"), asyncHandler(async (req, res) => {
  await db.delete(googleCalendarAccounts).where(eq(googleCalendarAccounts.userId, req.auth!.userId));
  res.json(calendarConnectionResponseSchema.parse({ connected: false }));
}));

calendarRouter.post("/sessions/:sessionId/google-event", requireAuth, requireApproved, requireRole("founder", "mentor"), asyncHandler(async (req, res) => {
  const result = await pool.query<{
    id: string; startup_name: string; mentor_name: string; starts_at: Date; ends_at: Date;
    timezone: string | null; meeting_url: string | null; status: string;
  }>("SELECT session.id,startup.name AS startup_name,mentor.full_name AS mentor_name,lower(session.time_range) AS starts_at, " +
    "upper(session.time_range) AS ends_at,mentor_profile.timezone,session.meeting_url,session.status FROM sessions session " +
    "JOIN startups startup ON startup.id=session.startup_id JOIN users founder ON founder.id=startup.founder_id " +
    "JOIN users mentor ON mentor.id=session.mentor_id JOIN mentor_profiles mentor_profile ON mentor_profile.user_id=mentor.id " +
    "WHERE session.id=$1 AND (founder.id=$2 OR mentor.id=$2)", [req.params.sessionId, req.auth!.userId]);
  const session = result.rows[0];
  if (!session) throw new NotFoundError("Session not found");
  const [account] = await db.select({ userId: googleCalendarAccounts.userId }).from(googleCalendarAccounts)
    .where(eq(googleCalendarAccounts.userId, req.auth!.userId)).limit(1);
  if (!account) throw new ConflictError("Connect your Google Calendar account first");
  const resultData = await createGoogleCalendarEvent(req.auth!.userId, {
    id: session.id, startupName: session.startup_name, mentorName: session.mentor_name,
    startsAt: session.starts_at, endsAt: session.ends_at, timezone: session.timezone ?? "UTC",
    meetingUrl: session.meeting_url, status: session.status,
  });
  res.json(resultData);
}));

