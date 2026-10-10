import { Router } from "express";
import {
  bookSessionSchema, meetingLinkSchema, rescheduleSessionSchema, sessionActionSchema,
  sessionDetailResponseSchema, sessionListResponseSchema, sessionSchema,
} from "@mentorloop/shared";
import { pool } from "../../db/client";
import { logger } from "../../config/logger";
import { asyncHandler } from "../../lib/async-handler";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors";
import { requireApproved } from "../../middleware/require-approved";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { validate } from "../../middleware/validate";
import { assertAvailableSlot } from "./availability.service";
import { updateOrCancelGoogleEvent } from "./calendar-google.service";

export const sessionsRouter = Router();
sessionsRouter.use(requireAuth, requireApproved, requireRole("founder", "mentor"));

const CHANGE_POLICY_MS = 24 * 60 * 60_000;

type SessionRow = {
  id: string; connection_id: string; mentor_id: string; startup_id: string; status: "scheduled" | "rescheduled" | "cancelled" | "completed" | "no_show";
  starts_at: Date; ends_at: Date; mentor_timezone: string | null; meeting_url: string | null;
  startup_name: string; mentor_name: string; created_at: Date; updated_at: Date;
  google_event_id?: string | null; calendar_owner_user_id?: string | null;
};

function asSession(row: SessionRow) {
  return sessionSchema.parse({
    id: row.id, connectionId: row.connection_id, mentorId: row.mentor_id, startupId: row.startup_id,
    status: row.status, startsAt: row.starts_at.toISOString(), endsAt: row.ends_at.toISOString(),
    mentorTimezone: row.mentor_timezone ?? "UTC", meetingUrl: row.meeting_url,
    startupName: row.startup_name, mentorName: row.mentor_name,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  });
}

const SESSION_SELECT = "SELECT session.id,session.connection_id,session.mentor_id,session.startup_id,session.status, " +
  "lower(session.time_range) AS starts_at,upper(session.time_range) AS ends_at,session.meeting_url,session.google_event_id,session.calendar_owner_user_id, " +
  "mentor_profile.timezone AS mentor_timezone,startup.name AS startup_name,mentor.full_name AS mentor_name, " +
  "session.created_at,session.updated_at FROM sessions session " +
  "JOIN startups startup ON startup.id=session.startup_id JOIN users founder ON founder.id=startup.founder_id " +
  "JOIN users mentor ON mentor.id=session.mentor_id JOIN mentor_profiles mentor_profile ON mentor_profile.user_id=mentor.id";

async function getSession(sessionId: string, userId: string) {
  const result = await pool.query<SessionRow>(SESSION_SELECT + " WHERE session.id=$1 AND (founder.id=$2 OR mentor.id=$2)", [sessionId, userId]);
  return result.rows[0] ? asSession(result.rows[0]) : null;
}

async function syncGoogleEvent(sessionId: string): Promise<void> {
  const result = await pool.query<SessionRow>(SESSION_SELECT + " WHERE session.id=$1", [sessionId]);
  const row = result.rows[0];
  if (!row?.google_event_id || !row.calendar_owner_user_id) return;
  await updateOrCancelGoogleEvent({
    id: row.id, startupName: row.startup_name, mentorName: row.mentor_name,
    startsAt: row.starts_at, endsAt: row.ends_at, timezone: row.mentor_timezone ?? "UTC",
    meetingUrl: row.meeting_url, status: row.status, googleEventId: row.google_event_id,
    calendarOwnerUserId: row.calendar_owner_user_id,
  });
}

function syncGoogleEventInBackground(sessionId: string): void {
  void syncGoogleEvent(sessionId).catch((error: unknown) => logger.warn({
    sessionId, error: error instanceof Error ? error.name : "unknown",
  }, "Session saved but Google Calendar event sync failed"));
}

function mapPgConflict(error: unknown): never {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: string }).code;
    if (code === "23P01") throw new ConflictError("That time was just booked. Refresh availability and choose another slot.");
    if (code === "23505") throw new ConflictError("This booking request was already processed");
  }
  throw error;
}

/** Create an idempotent session after locking and rechecking the accepted connection. */
sessionsRouter.post("/", validate({ body: bookSessionSchema }), asyncHandler(async (req, res) => {
  const input = bookSessionSchema.parse(req.body); const actorId = req.auth!.userId;
  const existing = await pool.query<{ id: string }>("SELECT id FROM sessions WHERE booking_actor_user_id=$1 AND idempotency_key=$2", [actorId, input.idempotencyKey]);
  if (existing.rows[0]) {
    const session = await getSession(existing.rows[0].id, actorId);
    if (session) return res.status(200).json(session);
  }
  const client = await pool.connect(); let createdId = "";
  try {
    await client.query("BEGIN");
    const participant = await client.query("SELECT connection.id,connection.mentor_id,connection.startup_id,startup.founder_id " +
      "FROM connections connection JOIN startups startup ON startup.id=connection.startup_id JOIN users actor ON actor.id=$2 " +
      "WHERE connection.id=$1 AND connection.state='accepted' AND actor.status='active' " +
      "AND ((actor.role='founder' AND startup.founder_id=actor.id) OR (actor.role='mentor' AND connection.mentor_id=actor.id)) FOR UPDATE OF connection",
      [input.connectionId, actorId]);
    const connection = participant.rows[0] as { mentor_id: string; startup_id: string } | undefined;
    if (!connection) throw new ForbiddenError("A session requires an accepted connection you belong to", "CONNECTION_REQUIRED");
    await client.query("SELECT user_id FROM mentor_profiles WHERE user_id=$1 FOR UPDATE", [connection.mentor_id]);
    const startsAt = new Date(input.startsAt);
    const endsAt = await assertAvailableSlot(connection.mentor_id, startsAt);
    const inserted = await client.query<{ id: string }>("INSERT INTO sessions " +
      "(connection_id,mentor_id,startup_id,time_range,status,booking_actor_user_id,idempotency_key,meeting_url) " +
      "VALUES ($1,$2,$3,tstzrange($4,$5,'[)'), 'scheduled',$6,$7,$8) RETURNING id",
      [input.connectionId, connection.mentor_id, connection.startup_id, startsAt, endsAt, actorId, input.idempotencyKey, input.meetingUrl]);
    createdId = inserted.rows[0]!.id;
    await client.query("INSERT INTO session_events(session_id,actor_user_id,event_type,to_status,new_starts_at,new_ends_at) " +
      "VALUES ($1,$2,'created','scheduled',$3,$4)", [createdId, actorId, startsAt, endsAt]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); mapPgConflict(error); }
  finally { client.release(); }
  const session = await getSession(createdId, actorId);
  if (!session) throw new Error("Booked session could not be read after save");
  res.status(201).json(session);
}));

sessionsRouter.get("/", asyncHandler(async (req, res) => {
  const sql = SESSION_SELECT + " WHERE founder.id=$1 OR mentor.id=$1 ORDER BY lower(session.time_range) DESC";
  const result = await pool.query<SessionRow>(sql, [req.auth!.userId]);
  res.json(sessionListResponseSchema.parse({ sessions: result.rows.map(asSession) }));
}));

sessionsRouter.get("/:sessionId/calendar.ics", asyncHandler(async (req, res) => {
  const session = await getSession(req.params.sessionId!, req.auth!.userId);
  if (!session) throw new NotFoundError("Session not found");
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=mentorloop-session-" + session.id + ".ics");
  res.send(buildCalendarIcs(session));
}));

sessionsRouter.get("/:sessionId", asyncHandler(async (req, res) => {
  const session = await getSession(req.params.sessionId!, req.auth!.userId);
  if (!session) throw new NotFoundError("Session not found");
  const history = await pool.query("SELECT event.id,event.event_type,event.from_status,event.to_status,event.old_starts_at,event.old_ends_at, " +
    "event.new_starts_at,event.new_ends_at,event.reason,actor.full_name AS actor_name,event.created_at " +
    "FROM session_events event LEFT JOIN users actor ON actor.id=event.actor_user_id WHERE event.session_id=$1 ORDER BY event.created_at,event.id", [session.id]);
  res.json(sessionDetailResponseSchema.parse({
    session,
    history: history.rows.map((row) => ({
      id: row.id, eventType: row.event_type, fromStatus: row.from_status, toStatus: row.to_status,
      oldStartsAt: row.old_starts_at?.toISOString() ?? null, oldEndsAt: row.old_ends_at?.toISOString() ?? null,
      newStartsAt: row.new_starts_at?.toISOString() ?? null, newEndsAt: row.new_ends_at?.toISOString() ?? null,
      reason: row.reason, actorName: row.actor_name, createdAt: row.created_at.toISOString(),
    })),
  }));
}));

sessionsRouter.post("/:sessionId/reschedule", validate({ body: rescheduleSessionSchema }), asyncHandler(async (req, res) => {
  const input = rescheduleSessionSchema.parse(req.body); const actorId = req.auth!.userId;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<SessionRow>(SESSION_SELECT +
      " WHERE session.id=$1 AND (founder.id=$2 OR mentor.id=$2) FOR UPDATE OF session",
      [req.params.sessionId, actorId]);
    const old = selected.rows[0];
    if (!old) throw new NotFoundError("Session not found");
    if (!["scheduled", "rescheduled"].includes(old.status)) throw new ConflictError("Only active sessions can be rescheduled");
    if (old.starts_at.getTime() - Date.now() < CHANGE_POLICY_MS) throw new ConflictError("Sessions cannot be rescheduled within 24 hours of their start");
    await client.query("SELECT user_id FROM mentor_profiles WHERE user_id=$1 FOR UPDATE", [old.mentor_id]);
    const startsAt = new Date(input.startsAt); const endsAt = await assertAvailableSlot(old.mentor_id, startsAt);
    const updated = await client.query("UPDATE sessions SET time_range=tstzrange($2,$3,'[)'),status='rescheduled',meeting_url=COALESCE($4,meeting_url),updated_at=now() WHERE id=$1",
      [old.id, startsAt, endsAt, input.meetingUrl ?? null]);
    void updated;
    await client.query("INSERT INTO session_events(session_id,actor_user_id,event_type,from_status,to_status,old_starts_at,old_ends_at,new_starts_at,new_ends_at,reason) " +
      "VALUES ($1,$2,'rescheduled',$3,'rescheduled',$4,$5,$6,$7,$8)", [old.id, actorId, old.status, old.starts_at, old.ends_at, startsAt, endsAt, input.reason]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); mapPgConflict(error); }
  finally { client.release(); }
  syncGoogleEventInBackground(req.params.sessionId!);
  res.json(await getSession(req.params.sessionId!, actorId));
}));

sessionsRouter.post("/:sessionId/actions", validate({ body: sessionActionSchema }), asyncHandler(async (req, res) => {
  const { action, reason } = sessionActionSchema.parse(req.body); const actorId = req.auth!.userId;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<SessionRow>(SESSION_SELECT + " WHERE session.id=$1 AND (founder.id=$2 OR mentor.id=$2) FOR UPDATE OF session", [req.params.sessionId, actorId]);
    const session = selected.rows[0];
    if (!session) throw new NotFoundError("Session not found");
    const now = new Date();
    if (action === "cancel") {
      if (!["scheduled", "rescheduled"].includes(session.status)) throw new ConflictError("Only active sessions can be cancelled");
      if (session.starts_at.getTime() - now.getTime() < CHANGE_POLICY_MS) throw new ConflictError("Sessions cannot be cancelled within 24 hours of their start");
      await client.query("UPDATE sessions SET status='cancelled',updated_at=$2 WHERE id=$1", [session.id, now]);
      await client.query("INSERT INTO session_events(session_id,actor_user_id,event_type,from_status,to_status,old_starts_at,old_ends_at,reason) VALUES ($1,$2,'cancelled',$3,'cancelled',$4,$5,$6)", [session.id, actorId, session.status, session.starts_at, session.ends_at, reason]);
    } else {
      if (!["scheduled", "rescheduled"].includes(session.status)) throw new ConflictError("Only active sessions can be closed");
      if (session.ends_at > now) throw new ConflictError("A session can only be completed or marked no-show after it ends");
      if (action === "no_show" && req.auth!.role !== "mentor") throw new ForbiddenError("Only the mentor can mark a participant no-show");
      const next = action === "complete" ? "completed" : "no_show";
      await client.query("UPDATE sessions SET status=$2,updated_at=$3 WHERE id=$1", [session.id, next, now]);
      await client.query("INSERT INTO session_events(session_id,actor_user_id,event_type,from_status,to_status,old_starts_at,old_ends_at,reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [session.id, actorId, next, session.status, next, session.starts_at, session.ends_at, reason ?? null]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { client.release(); }
  if (req.body.action === "cancel") syncGoogleEventInBackground(req.params.sessionId!);
  res.json(await getSession(req.params.sessionId!, actorId));
}));

sessionsRouter.patch("/:sessionId/meeting-link", validate({ body: meetingLinkSchema }), asyncHandler(async (req, res) => {
  const { meetingUrl } = meetingLinkSchema.parse(req.body); const actorId = req.auth!.userId;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<SessionRow>(SESSION_SELECT + " WHERE session.id=$1 AND (founder.id=$2 OR mentor.id=$2) FOR UPDATE OF session", [req.params.sessionId, actorId]);
    const old = result.rows[0];
    if (!old) throw new NotFoundError("Session not found");
    if (!["scheduled", "rescheduled"].includes(old.status)) throw new ConflictError("Meeting links can only be changed for active sessions");
    await client.query("UPDATE sessions SET meeting_url=$2,updated_at=now() WHERE id=$1", [old.id, meetingUrl]);
    await client.query("INSERT INTO session_events(session_id,actor_user_id,event_type,from_status,to_status) VALUES ($1,$2,'meeting_link_updated',$3,$3)", [old.id, actorId, old.status]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { client.release(); }
  syncGoogleEventInBackground(req.params.sessionId!);
  res.json(await getSession(req.params.sessionId!, actorId));
}));

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function icsDate(value: string): string { return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }

export function buildCalendarIcs(session: ReturnType<typeof asSession>): string {
  const uid = session.id + "@mentorloop";
  const details = "MentorLoop session between " + session.startupName + " and " + session.mentorName +
    (session.meetingUrl ? "\\nMeeting link: " + session.meetingUrl : "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MentorLoop//Sessions//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + icsDate(new Date().toISOString()), "DTSTART:" + icsDate(session.startsAt),
    "DTEND:" + icsDate(session.endsAt), "SUMMARY:" + icsEscape("MentorLoop: " + session.startupName + " × " + session.mentorName),
    "DESCRIPTION:" + icsEscape(details), ...(session.meetingUrl ? ["URL:" + session.meetingUrl, "LOCATION:" + session.meetingUrl] : []),
    "END:VEVENT", "END:VCALENDAR"];
  return lines.join("\r\n") + "\r\n";
}
