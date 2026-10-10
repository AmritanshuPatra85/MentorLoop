import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db, pool } from "../../db/client";
import { availabilityRules, mentorProfiles, startups, users } from "../../db/schema";
import { getMatchingWeights, rankCandidates, retrieveCandidates } from "./matching.service";

const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
let ids: string[] = [];
let founderId = "";
let mentorId = "";
let startupId = "";

before(async () => {
  const inserted = await db.insert(users).values([
    { email: `match-founder-${unique}@example.test`, fullName: "Matching Founder", role: "founder", status: "active", emailVerifiedAt: new Date() },
    { email: `match-mentor-${unique}@example.test`, fullName: "Matching Mentor", role: "mentor", status: "active", emailVerifiedAt: new Date() },
  ]).returning({ id: users.id });
  ids = inserted.map((item) => item.id); founderId = ids[0]!; mentorId = ids[1]!;
  const [startup] = await db.insert(startups).values({ founderId, name: "Matching Startup", isComplete: true, timezone: "UTC", preferredSessionTimes: [{ day: new Date().getUTCDay(), start: "00:00", end: "23:59" }] }).returning({ id: startups.id });
  startupId = startup!.id;
  await db.insert(mentorProfiles).values({ userId: mentorId, isComplete: true, maxMentees: 2, sessionLengthMinutes: 30, timezone: "UTC" });
  await db.insert(availabilityRules).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ mentorId, dayOfWeek, startTime: "00:00:00", endTime: "23:59:00" })));
  const vector = `[${Array.from({ length: 384 }, (_, index) => index === 0 ? 1 : 0).join(",")}]`;
  await pool.query("INSERT INTO profile_embeddings (startup_id,embedding,content_hash) VALUES ($1,$2::vector,'test')", [startupId, vector]);
  await pool.query("INSERT INTO profile_embeddings (mentor_id,embedding,content_hash) VALUES ($1,$2::vector,'test')", [mentorId, vector]);
});

after(async () => {
  if (ids.length) await db.delete(users).where((await import("drizzle-orm")).inArray(users.id, ids));
  await pool.end();
});

test("retrieves nearest eligible vector in both directions and returns weighted score breakdown", async () => {
  assert.deepEqual(await retrieveCandidates("mentor", founderId), [{ candidateId: mentorId, cosineDistance: 0 }]);
  assert.deepEqual(await retrieveCandidates("startup", mentorId), [{ candidateId: startupId, cosineDistance: 0 }]);
  const weights = await getMatchingWeights();
  assert.deepEqual(weights, { semanticSimilarity: 35, domainOverlap: 25, stageFit: 15, availabilityOverlap: 15, trackRecord: 10 });
  const ranked = await rankCandidates("mentor", founderId);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]!.candidateId, mentorId);
  assert.equal(ranked[0]!.signals.trackRecord.raw, 0.5);
  assert.equal(ranked[0]!.signals.semanticSimilarity.raw, 1);
  assert.ok(ranked[0]!.signals.availabilityOverlap.raw > 0.99, `availability score=${ranked[0]!.signals.availabilityOverlap.raw}`);
  assert.equal(ranked[0]!.newMentorBoost, 0.03);
  assert.ok(ranked[0]!.score >= 0.58 && ranked[0]!.score <= 0.59);
  const reverseRanked = await rankCandidates("startup", mentorId);
  assert.equal(reverseRanked.length, 1);
  assert.equal(reverseRanked[0]!.candidateId, startupId);
  assert.equal(reverseRanked[0]!.newMentorBoost, 0);
});

test("matching weight contract rejects an invalid total", async () => {
  const { matchingWeightsSchema } = await import("@mentorloop/shared");
  assert.equal(matchingWeightsSchema.safeParse({ semanticSimilarity: 35, domainOverlap: 25, stageFit: 15, availabilityOverlap: 15, trackRecord: 9 }).success, false);
});
