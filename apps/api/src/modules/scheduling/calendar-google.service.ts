import { createCipheriv, createDecipheriv, createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { env } from "../../config/env";
import { db } from "../../db/client";
import { googleCalendarAccounts, sessionEvents, sessions } from "../../db/schema";
import { AppError, ConflictError } from "../../lib/errors";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_ROOT = "https://www.googleapis.com/calendar/v3";
const TOKEN_KEY = createHash("sha256").update(env.JWT_ACCESS_SECRET).update("mentorloop-google-calendar-token-v1").digest();

export function encryptGoogleRefreshToken(token: string): string {
  const iv = randomUUID().replaceAll("-", "").slice(0, 24);
  const cipher = createCipheriv("aes-256-gcm", TOKEN_KEY, Buffer.from(iv, "hex"));
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag().toString("hex"), encrypted.toString("base64url")].join(".");
}

export function decryptGoogleRefreshToken(value: string): string {
  const [iv, tag, data] = value.split(".");
  if (!iv || !tag || !data) throw new Error("Stored Google calendar token is malformed");
  const decipher = createDecipheriv("aes-256-gcm", TOKEN_KEY, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

function googleClient() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new AppError(503, "GOOGLE_NOT_CONFIGURED", "Google Calendar is not configured");
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

export function googleCalendarRedirectUri() {
  googleClient();
  return env.API_URL.replace(/\/$/, "") + "/calendar/google/callback";
}

export async function exchangeGoogleCalendarCode(code: string, codeVerifier: string): Promise<{ refreshToken?: string; scopes: string[] }> {
  const cfg = googleClient();
  const response = await fetch(TOKEN_URL, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret,
      redirect_uri: googleCalendarRedirectUri(), grant_type: "authorization_code", code_verifier: codeVerifier }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new AppError(502, "GOOGLE_TOKEN_EXCHANGE_FAILED", "Google Calendar authorization could not be completed");
  const payload = await response.json() as { refresh_token?: unknown; scope?: unknown };
  return {
    ...(typeof payload.refresh_token === "string" ? { refreshToken: payload.refresh_token } : {}),
    scopes: typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [],
  };
}

async function accessTokenFor(userId: string): Promise<string> {
  const [account] = await db.select().from(googleCalendarAccounts).where(eq(googleCalendarAccounts.userId, userId)).limit(1);
  if (!account) throw new ConflictError("Connect a Google Calendar account first");
  const cfg = googleClient();
  const response = await fetch(TOKEN_URL, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret,
      refresh_token: decryptGoogleRefreshToken(account.encryptedRefreshToken), grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new AppError(502, "GOOGLE_TOKEN_REFRESH_FAILED", "Google Calendar authorization expired; reconnect your account");
  const payload = await response.json() as { access_token?: unknown };
  if (typeof payload.access_token !== "string") throw new AppError(502, "GOOGLE_TOKEN_REFRESH_FAILED", "Google did not return a calendar access token");
  return payload.access_token;
}

type CalendarSession = { id: string; startupName: string; mentorName: string; startsAt: Date; endsAt: Date; timezone: string; meetingUrl: string | null; status: string };

export async function createGoogleCalendarEvent(userId: string, session: CalendarSession) {
  if (session.status !== "scheduled" && session.status !== "rescheduled") throw new ConflictError("Only active sessions can be added to Google Calendar");
  const token = await accessTokenFor(userId);
  const eventId = "ml" + session.id.replaceAll("-", "");
  const response = await fetch(API_ROOT + "/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all", {
    method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({
      id: eventId,
      summary: "MentorLoop: " + session.startupName + " × " + session.mentorName,
      description: "MentorLoop session" + (session.meetingUrl ? "\nCurrent meeting link: " + session.meetingUrl : ""),
      start: { dateTime: session.startsAt.toISOString(), timeZone: session.timezone },
      end: { dateTime: session.endsAt.toISOString(), timeZone: session.timezone },
      conferenceData: { createRequest: { requestId: randomUUID().replaceAll("-", ""), conferenceSolutionKey: { type: "hangoutsMeet" } } },
    }), signal: AbortSignal.timeout(15_000),
  });
  let event: { id?: string; htmlLink?: string; hangoutLink?: string; conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> } };
  if (response.status === 409) {
    const existing = await fetch(API_ROOT + "/calendars/primary/events/" + eventId + "?conferenceDataVersion=1", {
      headers: { authorization: "Bearer " + token }, signal: AbortSignal.timeout(10_000),
    });
    if (!existing.ok) throw new AppError(502, "GOOGLE_CALENDAR_FAILED", "Google Calendar event could not be retrieved");
    event = await existing.json() as typeof event;
  } else {
    if (!response.ok) throw new AppError(502, "GOOGLE_CALENDAR_FAILED", "Google Calendar could not create this event");
    event = await response.json() as typeof event;
  }
  const meetUrl = event.hangoutLink ?? event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri;
  await db.update(sessions).set({ googleEventId: event.id ?? eventId, calendarOwnerUserId: userId,
    ...(meetUrl ? { meetingUrl: meetUrl } : {}), updatedAt: new Date() }).where(eq(sessions.id, session.id));
  if (meetUrl && meetUrl !== session.meetingUrl) {
    await db.insert(sessionEvents).values({
      sessionId: session.id, actorUserId: userId, eventType: "meeting_link_updated",
      fromStatus: session.status as "scheduled" | "rescheduled", toStatus: session.status as "scheduled" | "rescheduled",
    });
  }
  return { calendarUrl: event.htmlLink ?? null, meetingUrl: meetUrl ?? session.meetingUrl };
}

export async function updateOrCancelGoogleEvent(session: CalendarSession & { googleEventId?: string | null; calendarOwnerUserId?: string | null }) {
  if (!session.googleEventId || !session.calendarOwnerUserId) return;
  const token = await accessTokenFor(session.calendarOwnerUserId);
  const url = API_ROOT + "/calendars/primary/events/" + session.googleEventId + "?sendUpdates=all";
  const response = session.status === "cancelled"
    ? await fetch(url, { method: "DELETE", headers: { authorization: "Bearer " + token }, signal: AbortSignal.timeout(10_000) })
    : await fetch(url, { method: "PATCH", headers: { authorization: "Bearer " + token, "content-type": "application/json" },
        body: JSON.stringify({
          summary: "MentorLoop: " + session.startupName + " × " + session.mentorName,
          description: "MentorLoop session" + (session.meetingUrl ? "\nCurrent meeting link: " + session.meetingUrl : ""),
          location: session.meetingUrl,
          start: { dateTime: session.startsAt.toISOString(), timeZone: session.timezone },
          end: { dateTime: session.endsAt.toISOString(), timeZone: session.timezone },
        }),
        signal: AbortSignal.timeout(10_000) });
  if (!response.ok && response.status !== 404) throw new AppError(502, "GOOGLE_CALENDAR_SYNC_FAILED", "The session changed but its Google Calendar event could not be synced");
}
