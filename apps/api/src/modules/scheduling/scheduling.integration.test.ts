import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { inArray } from "drizzle-orm";
import { createApp } from "../../app";
import { db, pool } from "../../db/client";
import { availabilityRules, connections, mentorProfiles, sessionEvents, sessions, startups, users } from "../../db/schema";
import { redis } from "../../lib/redis";
import { closeEmbeddingQueue } from "../embeddings/embedding.queue";
import { closeMatchExplanationQueue } from "../matching/explanations/explanation.queue";
import { signAccessToken } from "../auth/tokens";

const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
let server: Server | undefined;
let baseUrl = "";
let founderId = "";
let mentorId = "";
let secondMentorId = "";
let startupId = "";
let connectionId = "";
let founderToken = "";
let mentorToken = "";

before(async () => {
  const [founder, mentor, secondMentor] = await db.insert(users).values([
    { email: `schedule-founder-${unique}@example.test`, fullName: "Schedule Founder", role: "founder", status: "active", emailVerifiedAt: new Date() },
    { email: `schedule-mentor-${unique}@example.test`, fullName: "Schedule Mentor", role: "mentor", status: "active", emailVerifiedAt: new Date() },
    { email: `schedule-mentor-b-${unique}@example.test`, fullName: "Second Schedule Mentor", role: "mentor", status: "active", emailVerifiedAt: new Date() },
  ]).returning({ id: users.id });
  founderId = founder!.id; mentorId = mentor!.id; secondMentorId = secondMentor!.id;
  founderToken = await signAccessToken({ id: founderId, role: "founder" });
  mentorToken = await signAccessToken({ id: mentorId, role: "mentor" });
  const [startup] = await db.insert(startups).values({
    founderId, name: `Schedule Startup ${unique}`, oneLiner: "Schedule test", description: "Integration-test startup for booking sessions safely.",
    isComplete: true, timezone: "UTC", preferredSessionTimes: [],
  }).returning({ id: startups.id });
  startupId = startup!.id;
  await db.insert(mentorProfiles).values({ userId: mentorId, currentRole: "Engineering leader", organization: "Test Org", bio: "Experienced mentor for founders testing scheduling.", isComplete: true, maxMentees: 3, sessionLengthMinutes: 30, timezone: "UTC", minimumNoticeMinutes: 0, bufferMinutes: 0 });
  await db.insert(mentorProfiles).values({ userId: secondMentorId, currentRole: "Design leader", organization: "Second Test Org", bio: "A second approved test mentor for connection transitions.", isComplete: true, maxMentees: 1, sessionLengthMinutes: 30, timezone: "UTC" });
  await db.insert(availabilityRules).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ mentorId, dayOfWeek, startTime: "00:00:00", endTime: "23:59:00" })));
  const [connection] = await db.insert(connections).values({ startupId, mentorId, initiatedBy: founderId, state: "accepted", respondedAt: new Date() }).returning({ id: connections.id });
  connectionId = connection!.id;
  const app = createApp();
  await new Promise<void>((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => {
      server = listener;
      const address = listener.address();
      if (!address || typeof address === "string") return reject(new Error("Could not bind scheduling test API"));
      baseUrl = `http://127.0.0.1:${address.port}`; resolve();
    });
    listener.once("error", reject);
  });
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  }
  if (founderId || mentorId || secondMentorId) await db.delete(users).where(inArray(users.id, [founderId, mentorId, secondMentorId].filter(Boolean)));
  await closeEmbeddingQueue().catch(() => undefined);
  await closeMatchExplanationQueue().catch(() => undefined);
  await Promise.allSettled([pool.end(), redis.quit()]);
});

test("accepted participants see real availability; booking is conflict-safe, idempotent, and auditable", async () => {
  const auth = { Authorization: `Bearer ${founderToken}` };
  const secondMentorToken = await signAccessToken({ id: secondMentorId, role: "mentor" });
  const requested = await db.insert(connections).values({ startupId, mentorId: secondMentorId, initiatedBy: founderId, state: "requested", introMessage: "I would appreciate guidance on early design research and customer discovery.", expiresAt: new Date(Date.now() + 7 * 86_400_000) }).returning({ id: connections.id });
  const accepted = await fetch(`${baseUrl}/connections/${requested[0]!.id}/respond`, { method: "POST", headers: { Authorization: `Bearer ${secondMentorToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept" }) });
  assert.equal(accepted.status, 200); assert.equal((await accepted.json() as { state: string }).state, "accepted");
  const duplicateResponse = await fetch(`${baseUrl}/connections/${requested[0]!.id}/respond`, { method: "POST", headers: { Authorization: `Bearer ${secondMentorToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "decline" }) });
  assert.equal(duplicateResponse.status, 403);

  const from = new Date(Date.now() + 48 * 60 * 60_000);
  const to = new Date(from.getTime() + 10 * 86_400_000);
  const slotsResponse = await fetch(`${baseUrl}/availability/connections/${connectionId}/slots?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&timezone=UTC`, { headers: auth });
  assert.equal(slotsResponse.status, 200);
  const { slots } = await slotsResponse.json() as { slots: Array<{ startsAt: string; endsAt: string }> };
  assert.ok(slots.length > 0);
  const slot = slots[0]!;

  const exception = await fetch(`${baseUrl}/availability/me/exceptions`, { method: "POST", headers: { Authorization: `Bearer ${mentorToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ startsAt: slot.startsAt, endsAt: slot.endsAt }) });
  assert.equal(exception.status, 201);
  const exceptionBody = await exception.json() as { id: string };
  const blockedSlots = await fetch(`${baseUrl}/availability/connections/${connectionId}/slots?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&timezone=UTC`, { headers: auth });
  assert.equal((await blockedSlots.json() as { slots: Array<{ startsAt: string }> }).slots.some((item) => item.startsAt === slot.startsAt), false);
  const removedException = await fetch(`${baseUrl}/availability/me/exceptions/${exceptionBody.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${mentorToken}` } });
  assert.equal(removedException.status, 204);

  const blocked = await fetch(`${baseUrl}/availability/connections/${connectionId}/slots?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&timezone=UTC`, { headers: { Authorization: `Bearer ${mentorToken}` } });
  assert.equal(blocked.status, 200);
  const request = (idempotencyKey: string) => fetch(`${baseUrl}/sessions`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, startsAt: slot.startsAt, meetingUrl: "https://meet.example.test/session", idempotencyKey }),
  });
  const [first, competing] = await Promise.all([request(crypto.randomUUID()), request(crypto.randomUUID())]);
  assert.deepEqual([first.status, competing.status].sort(), [201, 409]);
  const created = (await (first.status === 201 ? first : competing).json()) as { id: string; status: string; startsAt: string };
  assert.equal(created.status, "scheduled");

  const sameKey = crypto.randomUUID();
  const once = await request(sameKey);
  // The selected slot has already been taken; this failed attempt cannot reserve it.
  assert.equal(once.status, 409);
  const idempotentRequest = async () => fetch(`${baseUrl}/sessions`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, startsAt: slots[1]!.startsAt, meetingUrl: "https://meet.example.test/session", idempotencyKey: sameKey }),
  });
  const saved = await idempotentRequest(); assert.equal(saved.status, 201);
  const repeated = await idempotentRequest(); assert.equal(repeated.status, 200);
  assert.equal((await repeated.json() as { id: string }).id, (await saved.json().catch(() => ({})) as { id?: string }).id);

  const detail = await fetch(`${baseUrl}/sessions/${created.id}`, { headers: auth });
  assert.equal(detail.status, 200);
  const detailBody = await detail.json() as { session: { meetingUrl: string }; history: Array<{ eventType: string }> };
  assert.equal(detailBody.session.meetingUrl, "https://meet.example.test/session");
  assert.equal(detailBody.history[0]?.eventType, "created");
  const ics = await fetch(`${baseUrl}/sessions/${created.id}/calendar.ics`, { headers: auth });
  assert.equal(ics.status, 200); assert.match(await ics.text(), /BEGIN:VCALENDAR/);
  const moved = await fetch(`${baseUrl}/sessions/${created.id}/reschedule`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ startsAt: slots[2]!.startsAt, reason: "Move to another available time" }) });
  assert.equal(moved.status, 200);
  const cancelled = await fetch(`${baseUrl}/sessions/${created.id}/actions`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", reason: "Plans changed" }) });
  assert.equal(cancelled.status, 200); assert.equal((await cancelled.json() as { status: string }).status, "cancelled");
  assert.equal((await db.select({ id: sessionEvents.id }).from(sessionEvents).where(inArray(sessionEvents.sessionId, [created.id]))).length, 3);
  assert.equal((await db.select({ id: sessions.id }).from(sessions).where(inArray(sessions.startupId, [startupId]))).length, 2);
});
