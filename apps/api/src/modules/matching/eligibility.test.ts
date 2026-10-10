import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "../../db/client";
import {
  availabilityExceptions,
  availabilityRules,
  connections,
  mentorProfiles,
  sessions,
  startups,
  users,
} from "../../db/schema";
import { listEligibleMentorIds, listEligibleStartupIds } from "./eligibility.service";

const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const people = [
  {
    email: `elig-founder-a-${token}@kiit.ac.in`,
    fullName: "Eligible Founder A",
    role: "founder" as const,
    status: "active" as const,
    emailVerifiedAt: new Date(),
  },
  {
    email: `elig-founder-b-${token}@kiit.ac.in`,
    fullName: "Eligible Founder B",
    role: "founder" as const,
    status: "active" as const,
    emailVerifiedAt: new Date(),
  },
  {
    email: `elig-founder-c-${token}@kiit.ac.in`,
    fullName: "Eligible Founder C",
    role: "founder" as const,
    status: "active" as const,
    emailVerifiedAt: new Date(),
  },
  {
    email: `elig-unverified-${token}@kiit.ac.in`,
    fullName: "Unverified Founder",
    role: "founder" as const,
    status: "active" as const,
  },
  {
    email: `elig-inactive-${token}@kiit.ac.in`,
    fullName: "Inactive Founder",
    role: "founder" as const,
    status: "suspended" as const,
    emailVerifiedAt: new Date(),
  },
  {
    email: `elig-mentor-${token}@example.com`,
    fullName: "Eligible Mentor",
    role: "mentor" as const,
    status: "active" as const,
    emailVerifiedAt: new Date(),
  },
  {
    email: `elig-mentor-unverified-${token}@example.com`,
    fullName: "Unverified Mentor",
    role: "mentor" as const,
    status: "active" as const,
  },
  {
    email: `elig-mentor-pending-${token}@example.com`,
    fullName: "Pending Mentor",
    role: "mentor" as const,
    status: "pending_approval" as const,
    emailVerifiedAt: new Date(),
  },
  {
    email: `elig-mentor-suspended-${token}@example.com`,
    fullName: "Suspended Mentor",
    role: "mentor" as const,
    status: "suspended" as const,
    emailVerifiedAt: new Date(),
  },
  {
    email: `elig-mentor-incomplete-${token}@example.com`,
    fullName: "Incomplete Mentor",
    role: "mentor" as const,
    status: "active" as const,
    emailVerifiedAt: new Date(),
  },
];
let founderIds: string[] = [];
let unverifiedFounderId = "";
let userIds: string[] = [];
let mentorId = "";
let fixtureMentorIds: string[] = [];
let startupIds: string[] = [];
let activeConnectionId = "";
let scheduleDates: Date[] = [];
let bookedSessionIds: string[] = [];

function hasMentor(ids: string[]) {
  return ids.includes(mentorId);
}

function fixtureStartups(ids: string[]) {
  return ids.filter((id) => startupIds.includes(id));
}

function fixtureMentors(ids: string[]) {
  return ids.filter((id) => fixtureMentorIds.includes(id));
}

function utcDateAt(dayOffset: number, hour = 0) {
  const now = new Date();
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset, hour),
  );
  return date;
}

before(async () => {
  const createdUsers = await db
    .insert(users)
    .values(people)
    .returning({ id: users.id, email: users.email, role: users.role });
  userIds = createdUsers.map((row) => row.id);
  founderIds = people
    .slice(0, 3)
    .map((person) => createdUsers.find((row) => row.email === person.email)!.id);
  unverifiedFounderId = createdUsers.find((row) => row.email === people[3]!.email)!.id;
  const inactiveId = createdUsers.find((row) => row.email === people[4]!.email)!.id;
  fixtureMentorIds = people
    .slice(5)
    .map((person) => createdUsers.find((row) => row.email === person.email)!.id);
  mentorId = fixtureMentorIds[0]!;

  const createdStartups = await db
    .insert(startups)
    .values([
      { founderId: founderIds[0]!, isComplete: true, name: "Startup A" },
      { founderId: founderIds[1]!, isComplete: true, name: "Startup B" },
      { founderId: founderIds[2]!, isComplete: true, name: "Startup C" },
      { founderId: unverifiedFounderId, isComplete: true, name: "Unverified Startup" },
      { founderId: inactiveId, isComplete: true, name: "Inactive Startup" },
    ])
    .returning({ id: startups.id, name: startups.name });
  startupIds = [
    "Startup A",
    "Startup B",
    "Startup C",
    "Unverified Startup",
    "Inactive Startup",
  ].map((name) => createdStartups.find((startup) => startup.name === name)!.id);

  await db.insert(mentorProfiles).values(
    fixtureMentorIds.map((userId, index) => ({
      userId,
      isComplete: index !== fixtureMentorIds.length - 1,
      maxMentees: 2,
      sessionLengthMinutes: 60,
      timezone: "UTC",
      bufferMinutes: 0,
      minimumNoticeMinutes: 0,
    })),
  );
  await db.insert(availabilityRules).values(
    fixtureMentorIds.flatMap((userId) =>
      Array.from({ length: 7 }, (_, dayOfWeek) => ({
        mentorId: userId,
        dayOfWeek,
        startTime: "00:00:00",
        endTime: "23:59:00",
      })),
    ),
  );

  const [active] = await db
    .insert(connections)
    .values({
      startupId: startupIds[1]!,
      mentorId,
      initiatedBy: founderIds[1]!,
      state: "accepted",
      respondedAt: new Date(),
    })
    .returning({ id: connections.id });
  activeConnectionId = active!.id;

  scheduleDates = Array.from({ length: 15 }, (_, day) => utcDateAt(day));
  const booked = await db
    .insert(sessions)
    .values(
      scheduleDates.map((date) => {
        const start = date.toISOString();
        const end = new Date(date.getTime() + (23 * 60 + 59) * 60_000).toISOString();
        return {
          connectionId: activeConnectionId,
          mentorId,
          startupId: startupIds[1]!,
          timeRange: `["${start}","${end}")`,
          status: "scheduled" as const,
        };
      }),
    )
    .returning({ id: sessions.id });
  bookedSessionIds = booked.map((session) => session.id);
});

after(async () => {
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  await pool.end();
});

test("filters both directions by verified active complete accounts and actual bookable time", async () => {
  assert.equal(hasMentor(await listEligibleMentorIds(founderIds[0]!)), false);
  assert.deepEqual(fixtureStartups(await listEligibleStartupIds(mentorId)), []);

  await db
    .update(sessions)
    .set({ status: "cancelled" })
    .where(eq(sessions.id, bookedSessionIds[1]!));
  assert.deepEqual(fixtureMentors(await listEligibleMentorIds(founderIds[0]!)), [
    mentorId,
  ]);
  assert.deepEqual(
    fixtureStartups(await listEligibleStartupIds(mentorId)),
    [startupIds[0]!, startupIds[2]!].sort(),
  );
  for (const ineligibleMentorId of fixtureMentorIds.slice(1)) {
    assert.deepEqual(await listEligibleStartupIds(ineligibleMentorId), []);
  }

  const closedDate = scheduleDates[1]!;
  await db.insert(availabilityExceptions).values({
    mentorId,
    startsAt: closedDate!,
    endsAt: new Date(closedDate!.getTime() + (23 * 60 + 59) * 60_000),
  });
  assert.equal(hasMentor(await listEligibleMentorIds(founderIds[0]!)), false);
  await db
    .delete(availabilityExceptions)
    .where(eq(availabilityExceptions.mentorId, mentorId));
  assert.equal(hasMentor(await listEligibleMentorIds(founderIds[0]!)), true);
});

test("pending pairs do not consume capacity, but are not returned as duplicate candidates", async () => {
  await db.insert(connections).values({
    startupId: startupIds[0]!,
    mentorId,
    initiatedBy: founderIds[0]!,
    state: "requested",
    expiresAt: new Date(Date.now() + 14 * 86_400_000),
  });
  assert.equal(hasMentor(await listEligibleMentorIds(founderIds[0]!)), false);
  assert.equal(hasMentor(await listEligibleMentorIds(founderIds[2]!)), true);

  await db
    .update(mentorProfiles)
    .set({ maxMentees: 1 })
    .where(eq(mentorProfiles.userId, mentorId));
  assert.equal(hasMentor(await listEligibleMentorIds(founderIds[2]!)), false);
  await db
    .update(mentorProfiles)
    .set({ maxMentees: 2 })
    .where(eq(mentorProfiles.userId, mentorId));
});

test("decline cooldown blocks the pair for 30 days and then releases it", async () => {
  await db
    .update(connections)
    .set({
      state: "declined",
      respondedAt: new Date(),
      lastDeclinedAt: new Date(),
      expiresAt: null,
    })
    .where(
      and(eq(connections.startupId, startupIds[0]!), eq(connections.mentorId, mentorId)),
    );
  assert.equal(hasMentor(await listEligibleMentorIds(founderIds[0]!)), false);
  await db
    .update(connections)
    .set({ lastDeclinedAt: new Date(Date.now() - 31 * 86_400_000) })
    .where(
      and(eq(connections.startupId, startupIds[0]!), eq(connections.mentorId, mentorId)),
    );
  assert.equal(hasMentor(await listEligibleMentorIds(founderIds[0]!)), true);
});

test("current accepted pairs are excluded; inactive, unverified, or incomplete sources return no candidates", async () => {
  await db
    .update(mentorProfiles)
    .set({ maxMentees: 4 })
    .where(eq(mentorProfiles.userId, mentorId));
  await db
    .update(connections)
    .set({ state: "accepted", respondedAt: new Date() })
    .where(
      and(eq(connections.startupId, startupIds[0]!), eq(connections.mentorId, mentorId)),
    );
  assert.equal(hasMentor(await listEligibleMentorIds(founderIds[0]!)), false);
  assert.deepEqual(await listEligibleMentorIds(unverifiedFounderId), []);
  await db
    .update(startups)
    .set({ isComplete: false })
    .where(eq(startups.id, startupIds[2]!));
  assert.deepEqual(fixtureStartups(await listEligibleStartupIds(mentorId)), []);
});

test("database rejects overlapping booked sessions for the same mentor", async () => {
  await assert.rejects(
    db.insert(sessions).values({
      connectionId: activeConnectionId,
      mentorId,
      startupId: startupIds[1]!,
      timeRange: `["${scheduleDates[0]!.toISOString()}","${new Date(scheduleDates[0]!.getTime() + 60 * 60_000).toISOString()}")`,
      status: "scheduled",
    }),
    (error: unknown) =>
      !!error && typeof error === "object" && "code" in error && error.code === "23P01",
  );
});
