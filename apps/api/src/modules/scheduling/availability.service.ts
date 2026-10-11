import { eq } from "drizzle-orm";
import { db, pool } from "../../db/client";
import { availabilityExceptions, availabilityRules, mentorProfiles } from "../../db/schema";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { enqueueProfileEmbedding } from "../embeddings/embedding.queue";
import { isTimeZone, localDateKey, localDateTimeToInstant, nextDateKey, weekdayForDateKey } from "./time";

export type Slot = { startsAt: string; endsAt: string };

export async function readAvailability(mentorId: string) {
  const [profile] = await db.select({
    timezone: mentorProfiles.timezone,
    sessionLengthMinutes: mentorProfiles.sessionLengthMinutes,
    bufferMinutes: mentorProfiles.bufferMinutes,
    minimumNoticeMinutes: mentorProfiles.minimumNoticeMinutes,
  }).from(mentorProfiles).where(eq(mentorProfiles.userId, mentorId)).limit(1);
  if (!profile) throw new NotFoundError("Mentor availability not found");
  const [rules, exceptions] = await Promise.all([
    db.select().from(availabilityRules).where(eq(availabilityRules.mentorId, mentorId)).orderBy(availabilityRules.dayOfWeek, availabilityRules.startTime),
    db.select().from(availabilityExceptions).where(eq(availabilityExceptions.mentorId, mentorId)).orderBy(availabilityExceptions.startsAt),
  ]);
  return {
    timezone: profile.timezone ?? "UTC",
    sessionLengthMinutes: profile.sessionLengthMinutes ?? 30,
    bufferMinutes: profile.bufferMinutes,
    minimumNoticeMinutes: profile.minimumNoticeMinutes,
    rules: rules.map((rule) => ({ id: rule.id, dayOfWeek: rule.dayOfWeek, startTime: rule.startTime.slice(0, 5), endTime: rule.endTime.slice(0, 5) })),
    exceptions: exceptions.map((exception) => ({ id: exception.id, startsAt: exception.startsAt.toISOString(), endsAt: exception.endsAt.toISOString() })),
  };
}

export async function saveAvailability(mentorId: string, input: {
  timezone: string; sessionLengthMinutes: number; bufferMinutes: number; minimumNoticeMinutes: number;
  rules: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
}) {
  if (!isTimeZone(input.timezone)) throw new ConflictError("Choose a valid IANA timezone");
  await db.transaction(async (tx) => {
    const [profile] = await tx.select({ userId: mentorProfiles.userId }).from(mentorProfiles)
      .where(eq(mentorProfiles.userId, mentorId)).for("update").limit(1);
    if (!profile) throw new NotFoundError("Mentor profile not found");
    await tx.update(mentorProfiles).set({
      timezone: input.timezone,
      sessionLengthMinutes: input.sessionLengthMinutes,
      bufferMinutes: input.bufferMinutes,
      minimumNoticeMinutes: input.minimumNoticeMinutes,
      updatedAt: new Date(),
    }).where(eq(mentorProfiles.userId, mentorId));
    await tx.delete(availabilityRules).where(eq(availabilityRules.mentorId, mentorId));
    if (input.rules.length) await tx.insert(availabilityRules).values(input.rules.map((rule) => ({ mentorId, ...rule })));
  });
  // The profile row's updated_at moved, and matching treats an embedding older than the
  // profile as stale. Queue a refresh after commit; the job is deduplicated and, when the
  // embedded text is unchanged, only refreshes the vector's timestamp.
  await enqueueProfileEmbedding({ profileType: "mentor", profileId: mentorId });
  return readAvailability(mentorId);
}

export async function addAvailabilityException(mentorId: string, startsAt: Date, endsAt: Date) {
  if (startsAt.getTime() <= Date.now()) throw new ConflictError("Unavailable periods must start in the future");
  const [row] = await db.insert(availabilityExceptions).values({ mentorId, startsAt, endsAt }).returning();
  if (!row) throw new Error("Could not save availability exception");
  return { id: row.id, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() };
}

export async function getAvailableSlots(mentorId: string, from: Date, to: Date): Promise<Slot[]> {
  const result = await pool.query<{
    timezone: string | null; duration: number | null; buffer: number; notice: number;
  }>(`SELECT timezone, session_length_minutes AS duration, buffer_minutes AS buffer,
             minimum_notice_minutes AS notice
      FROM mentor_profiles WHERE user_id=$1 AND is_complete=true`, [mentorId]);
  const profile = result.rows[0];
  if (!profile?.timezone || !isTimeZone(profile.timezone) || !profile.duration || profile.duration <= 0) return [];
  const timezone = profile.timezone;
  const rulesResult = await pool.query<{ day_of_week: number; start_time: string; end_time: string }>(
    "SELECT day_of_week,start_time::text,end_time::text FROM availability_rules WHERE mentor_id=$1 ORDER BY day_of_week,start_time", [mentorId],
  );
  const rules = rulesResult.rows;
  if (!rules.length) return [];
  const [exceptions, bookings] = await Promise.all([
    pool.query<{ starts_at: Date; ends_at: Date }>(
      "SELECT starts_at,ends_at FROM availability_exceptions WHERE mentor_id=$1 AND starts_at<$3 AND ends_at>$2", [mentorId, from, to],
    ),
    pool.query<{ starts_at: Date; ends_at: Date }>(
      "SELECT lower(time_range) AS starts_at,upper(time_range) AS ends_at FROM sessions WHERE mentor_id=$1 AND status IN ('scheduled','rescheduled') AND time_range && tstzrange($2,$3,'[)')", [mentorId, new Date(from.getTime() - profile.buffer * 60_000), new Date(to.getTime() + profile.buffer * 60_000)],
    ),
  ]);
  const earliest = Math.max(from.getTime(), Date.now() + profile.notice * 60_000);
  const slots: Slot[] = [];
  let dateKey = localDateKey(from, timezone);
  const lastDateKey = localDateKey(to, timezone);
  while (dateKey <= lastDateKey) {
    for (const rule of rules) {
      if (rule.day_of_week !== weekdayForDateKey(dateKey)) continue;
      const start = localDateTimeToInstant(dateKey, rule.start_time.slice(0, 5), timezone);
      const end = localDateTimeToInstant(dateKey, rule.end_time.slice(0, 5), timezone);
      if (!start || !end || start >= end) continue;
      const durationMs = profile.duration * 60_000;
      for (let startMs = start.getTime(); startMs + durationMs <= end.getTime(); startMs += durationMs) {
        const endMs = startMs + durationMs;
        if (startMs < earliest || startMs < from.getTime() || endMs > to.getTime()) continue;
        const inException = exceptions.rows.some((item) => startMs < item.ends_at.getTime() && endMs > item.starts_at.getTime());
        const conflicts = bookings.rows.some((item) => startMs < item.ends_at.getTime() + profile.buffer * 60_000 && endMs > item.starts_at.getTime() - profile.buffer * 60_000);
        if (!inException && !conflicts) slots.push({ startsAt: new Date(startMs).toISOString(), endsAt: new Date(endMs).toISOString() });
      }
    }
    dateKey = nextDateKey(dateKey);
  }
  return slots.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export async function assertAvailableSlot(mentorId: string, startsAt: Date): Promise<Date> {
  const profile = await pool.query<{ duration: number | null }>("SELECT session_length_minutes AS duration FROM mentor_profiles WHERE user_id=$1", [mentorId]);
  const duration = profile.rows[0]?.duration;
  if (!duration) throw new ConflictError("The mentor has not configured a session length");
  const from = new Date(startsAt.getTime() - 24 * 60 * 60_000);
  const to = new Date(startsAt.getTime() + 24 * 60 * 60_000);
  const slots = await getAvailableSlots(mentorId, from, to);
  const selected = slots.find((slot) => Date.parse(slot.startsAt) === startsAt.getTime());
  if (!selected) throw new ConflictError("This time is no longer available. Refresh the slots and choose another time.");
  return new Date(selected.endsAt);
}