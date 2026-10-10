import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { inArray } from "drizzle-orm";
import { createApp } from "../../app";
import { db, pool } from "../../db/client";
import { availabilityRules, connections, matchEvents, mentorProfiles, startups, users } from "../../db/schema";
import { redis } from "../../lib/redis";
import { closeEmbeddingQueue } from "../embeddings/embedding.queue";
import { closeMatchExplanationQueue } from "../matching/explanations/explanation.queue";
import { listEligibleMentorIds } from "../matching/eligibility.service";
import { signAccessToken } from "../auth/tokens";

const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
let server: Server | undefined;
let baseUrl = "";
let founderId = "";
let otherFounderId = "";
let mentorId = "";
let startupId = "";
let dismissedStartupId = "";
let founderToken = "";
let mentorToken = "";

before(async () => {
  const [founder, otherFounder, mentor] = await db.insert(users).values([
    { email: `connections-founder-${unique}@kiit.ac.in`, fullName: "Connections Founder", role: "founder", status: "active", emailVerifiedAt: new Date() },
    { email: `connections-founder-b-${unique}@kiit.ac.in`, fullName: "Second Connections Founder", role: "founder", status: "active", emailVerifiedAt: new Date() },
    { email: `connections-mentor-${unique}@example.test`, fullName: "Connections Mentor", role: "mentor", status: "active", emailVerifiedAt: new Date() },
  ]).returning({ id: users.id, role: users.role });
  founderId = founder!.id;
  otherFounderId = otherFounder!.id;
  mentorId = mentor!.id;
  founderToken = await signAccessToken({ id: founderId, role: "founder" });
  mentorToken = await signAccessToken({ id: mentorId, role: "mentor" });
  const createdStartups = await db.insert(startups).values([
    { founderId, name: `Feed Startup ${unique}`, oneLiner: "Building a better founder toolkit", description: "A complete startup profile for mentor discovery and connections.", isComplete: true, timezone: "UTC", preferredSessionTimes: [] },
    { founderId: otherFounderId, name: `Second Feed Startup ${unique}`, oneLiner: "A second fit for dismiss testing", description: "Another complete startup profile for matching tests.", isComplete: true, timezone: "UTC", preferredSessionTimes: [] },
  ]).returning({ id: startups.id });
  startupId = createdStartups[0]!.id;
  dismissedStartupId = createdStartups[1]!.id;
  await db.insert(mentorProfiles).values({
    userId: mentorId, currentRole: "Product mentor", organization: "MentorLoop Test",
    bio: "Experienced product leader helping early founders.", isComplete: true,
    maxMentees: 2, sessionLengthMinutes: 30, timezone: "UTC",
  });
  await db.insert(availabilityRules).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({
    mentorId, dayOfWeek, startTime: "00:00:00", endTime: "23:59:00",
  })));
  const vector = `[${Array.from({ length: 384 }, (_, index) => index === 0 ? 1 : 0).join(",")}]`;
  await pool.query("INSERT INTO profile_embeddings (startup_id,embedding,content_hash) VALUES ($1,$2::vector,'test-feed'),($3,$2::vector,'test-feed')", [startupId, vector, dismissedStartupId]);
  await pool.query("INSERT INTO profile_embeddings (mentor_id,embedding,content_hash) VALUES ($1,$2::vector,'test-feed')", [mentorId, vector]);

  const app = createApp();
  await new Promise<void>((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => {
      server = listener;
      const address = listener.address();
      if (!address || typeof address === "string") return reject(new Error("Could not bind connections test API"));
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
    listener.once("error", reject);
  });
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  }
  if (founderId || otherFounderId || mentorId) await db.delete(users).where(inArray(users.id, [founderId, otherFounderId, mentorId].filter(Boolean)));
  await closeEmbeddingQueue().catch(() => undefined);
  await closeMatchExplanationQueue().catch(() => undefined);
  await Promise.allSettled([pool.end(), redis.quit()]);
});

test("founder discovery actions enforce their direction, throttle views, and persist dismissals", async () => {
  const path = `${baseUrl}/matches/mentor/${mentorId}/events`;
  const unauthorized = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "view" }) });
  assert.equal(unauthorized.status, 401);
  const wrongRole = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${mentorToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "view" }) });
  assert.equal(wrongRole.status, 403);
  const invalidEvent = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${founderToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "follow" }) });
  assert.equal(invalidEvent.status, 400);

  const view = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${founderToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "view" }) });
  assert.equal(view.status, 201);
  const repeatView = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${founderToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "view" }) });
  assert.equal((await repeatView.json() as { recorded: boolean }).recorded, false);

  const save = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${founderToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "save" }) });
  assert.equal(save.status, 201);
  const dismiss = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${founderToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "dismiss" }) });
  assert.equal(dismiss.status, 201);
  assert.equal((await listEligibleMentorIds(founderId)).includes(mentorId), false);
});


test("mentor sees ranked startup, sends an invite, and founder sees the pending invitation", async () => {
  const feed = await fetch(`${baseUrl}/matches/startups`, { headers: { Authorization: `Bearer ${mentorToken}` } });
  assert.equal(feed.status, 200);
  const feedBody = await feed.json() as { matches: Array<{ candidateId: string; startup: { id: string; name: string } }> };
  assert.equal(feedBody.matches.some((match) => match.candidateId === startupId), true);
  assert.equal(feedBody.matches.find((match) => match.candidateId === startupId)?.startup.name, `Feed Startup ${unique}`);

  const viewPath = `${baseUrl}/matches/startup/${dismissedStartupId}/events`;
  const view = await fetch(viewPath, { method: "POST", headers: { Authorization: `Bearer ${mentorToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "view" }) });
  assert.equal(view.status, 201);
  const repeatView = await fetch(viewPath, { method: "POST", headers: { Authorization: `Bearer ${mentorToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "view" }) });
  assert.equal((await repeatView.json() as { recorded: boolean }).recorded, false);

  const savePath = `${baseUrl}/matches/startup/${dismissedStartupId}/events`;
  const save = await fetch(savePath, { method: "POST", headers: { Authorization: `Bearer ${mentorToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "save" }) });
  assert.equal(save.status, 201);
  const repeatSave = await fetch(savePath, { method: "POST", headers: { Authorization: `Bearer ${mentorToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "save" }) });
  assert.equal((await repeatSave.json() as { recorded: boolean }).recorded, false);
  const savedFeed = await fetch(`${baseUrl}/matches/startups`, { headers: { Authorization: `Bearer ${mentorToken}` } });
  const savedFeedBody = await savedFeed.json() as { matches: Array<{ candidateId: string; saved: boolean }> };
  assert.equal(savedFeedBody.matches.find((match) => match.candidateId === dismissedStartupId)?.saved, true);

  const dismiss = await fetch(savePath, { method: "POST", headers: { Authorization: `Bearer ${mentorToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "dismiss", dismissalReason: "Not a relevant stage right now" }) });
  assert.equal(dismiss.status, 201);
  const repeatDismiss = await fetch(savePath, { method: "POST", headers: { Authorization: `Bearer ${mentorToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "dismiss" }) });
  assert.equal(repeatDismiss.status, 200);
  assert.equal((await repeatDismiss.json() as { recorded: boolean }).recorded, false);
  const badReason = await fetch(savePath, { method: "POST", headers: { Authorization: `Bearer ${mentorToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "dismiss", dismissalReason: "x".repeat(501) }) });
  assert.equal(badReason.status, 400);
  const hiddenFeed = await fetch(`${baseUrl}/matches/startups`, { headers: { Authorization: `Bearer ${mentorToken}` } });
  const hiddenFeedBody = await hiddenFeed.json() as { matches: Array<{ candidateId: string }> };
  assert.equal(hiddenFeedBody.matches.some((match) => match.candidateId === dismissedStartupId), false);
  assert.equal(hiddenFeedBody.matches.some((match) => match.candidateId === startupId), true);

  const invitation = await fetch(`${baseUrl}/connections/invites`, {
    method: "POST",
    headers: { Authorization: `Bearer ${mentorToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startupId, introMessage: "I can help you sharpen product discovery and validate your first customer segment." }),
  });
  assert.equal(invitation.status, 201);
  const invitationBody = await invitation.json() as { id: string; state: string; mentorId: string; expiresAt: string };
  assert.equal(invitationBody.state, "invited");
  assert.equal(invitationBody.mentorId, mentorId);
  assert.ok(new Date(invitationBody.expiresAt).getTime() > Date.now());

  const inbox = await fetch(`${baseUrl}/connections/incoming`, { headers: { Authorization: `Bearer ${founderToken}` } });
  assert.equal(inbox.status, 200);
  const inboxBody = await inbox.json() as { invites: Array<{ id: string; mentorName: string; introMessage: string | null }> };
  assert.equal(inboxBody.invites.length, 1);
  assert.equal(inboxBody.invites[0]?.id, invitationBody.id);
  assert.equal(inboxBody.invites[0]?.mentorName, "Connections Mentor");
  assert.match(inboxBody.invites[0]?.introMessage ?? "", /product discovery/);
  const requestEvents = await db.select({ id: matchEvents.id, connectionId: matchEvents.connectionId, eventType: matchEvents.eventType }).from(matchEvents).where(inArray(matchEvents.connectionId, [invitationBody.id]));
  assert.equal(requestEvents.length, 1);
  assert.equal(requestEvents[0]?.connectionId, invitationBody.id);
  assert.equal(requestEvents[0]?.eventType, "request");

  const duplicate = await fetch(`${baseUrl}/connections/invites`, {
    method: "POST",
    headers: { Authorization: `Bearer ${mentorToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startupId, introMessage: "I would also like to help with your customer discovery work." }),
  });
  assert.equal(duplicate.status, 409);
  const failedInvite = await fetch(`${baseUrl}/connections/invites`, { method: "POST", headers: { Authorization: `Bearer ${mentorToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ startupId: randomUUID(), introMessage: "I would like to discuss possible mentorship support." }) });
  assert.equal(failedInvite.status, 409);
  const afterFailedInviteEvents = await db.select({ id: matchEvents.id }).from(matchEvents).where(inArray(matchEvents.connectionId, [invitationBody.id]));
  assert.equal(afterFailedInviteEvents.length, 1);
  const saved = await db.select({ id: connections.id }).from(connections).where(inArray(connections.id, [invitationBody.id]));
  assert.equal(saved.length, 1);
});