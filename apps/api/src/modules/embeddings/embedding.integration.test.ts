import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, pool } from "../../db/client";
import { domains, skills, stages, startups, users } from "../../db/schema";
import { redis } from "../../lib/redis";
import { saveFounderOnboarding } from "../founder-onboarding/founder-onboarding.service";
import { saveMentorOnboarding } from "../mentor-onboarding/mentor-onboarding.service";
import { closeEmbeddingQueue, embeddingQueue } from "./embedding.queue";
import { createEmbeddingProcessor } from "./embedding.processor";
import { deleteEmbeddingIfCurrent, getStoredEmbedding, hashEmbeddingText, loadEmbeddingProfile, storeEmbeddingIfCurrent } from "./embedding.repository";

const suffix = randomUUID();
const founderId = randomUUID();
const mentorId = randomUUID();
const founderJob = { profileType: "startup" as const, profileId: "" };
const testQueueIds: string[] = [];

after(async () => {
  for (const id of testQueueIds) {
    const matching = await embeddingQueue.getJobs(["delayed", "waiting", "paused", "active"], 0, 500);
    for (const job of matching.filter((candidate) => candidate.data.profileId === id))
      await job.remove().catch(() => undefined);
  }
  await closeEmbeddingQueue();
  await db.delete(users).where(eq(users.id, founderId));
  await db.delete(users).where(eq(users.id, mentorId));
  redis.disconnect();
  await pool.end();
});

test("profile saves enqueue debounced startup and mentor updates; persisted hashes are idempotent", async () => {
  const [domain] = await db.select({ slug: domains.slug }).from(domains).limit(1);
  const skillOptions = await db.select({ slug: skills.slug, name: skills.name }).from(skills).orderBy(skills.slug).limit(2);
  const [skill] = skillOptions;
  const [stage] = await db.select({ slug: stages.slug }).from(stages).limit(1);
  assert.ok(domain && skill && skillOptions[1] && stage, "seed at least two skills and a domain/stage before embedding integration tests");
  await db.insert(users).values([
    { id: founderId, email: `embedding-founder-${suffix}@kiit.ac.in`, role: "founder", status: "active", fullName: "Embedding Founder", emailVerifiedAt: new Date() },
    { id: mentorId, email: `embedding-mentor-${suffix}@example.com`, role: "mentor", status: "pending_approval", fullName: "Embedding Mentor", emailVerifiedAt: new Date() },
  ]);

  const founderInput = {
    founderTitle: "Founder", linkedinUrl: "", startupName: "Pipeline Startup", oneLiner: "Build financial software",
    description: "A startup description used to exercise automatic profile embeddings.", domainSlugs: [domain.slug],
    primaryDomainSlug: domain.slug, stageSlug: stage.slug, helpNeeded: "Customer discovery", goals: "Grow sustainably",
    timezone: "Asia/Kolkata", preferredSessionTimes: [],
  };
  await saveFounderOnboarding(founderId, founderInput, true);
  const [startup] = await db.select({ id: startups.id }).from(startups).where(eq(startups.founderId, founderId)).limit(1);
  assert.ok(startup);
  founderJob.profileId = startup.id;
  testQueueIds.push(founderJob.profileId, mentorId);

  const mentorInput = {
    currentRole: "CTO", organization: "Pipeline Inc", bio: "Experienced founder mentor with a long track record.",
    experienceSummary: "Led teams and coached founders.", yearsExperience: 11, domainSlugs: [domain.slug],
    skillSlugs: [skill.slug], stageSlugs: [stage.slug], helpTopics: "Fundraising and product strategy",
    maxMentees: 3, sessionLengthMinutes: 60 as const, timezone: "Asia/Kolkata", preferredSessionTimes: [],
    linkedinUrl: "", websiteUrl: "",
  };
  await saveMentorOnboarding(mentorId, mentorInput, true);
  await saveMentorOnboarding(mentorId, { ...mentorInput, skillSlugs: [skillOptions[1]!.slug] }, true);

  const jobs = await embeddingQueue.getJobs(["delayed", "waiting", "paused", "active"], 0, 500);
  assert.equal(jobs.filter((job) => job.data.profileId === founderJob.profileId).length, 1);
  assert.equal(jobs.filter((job) => job.data.profileId === mentorId).length, 1);

  const generated: string[] = [];
  const processor = createEmbeddingProcessor({
    load: loadEmbeddingProfile,
    getStored: getStoredEmbedding,
    store: storeEmbeddingIfCurrent,
    remove: deleteEmbeddingIfCurrent,
    generate: async (text) => { generated.push(text); return Array.from({ length: 384 }, (_, index) => index === 0 ? 1 : 0); },
  });
  assert.deepEqual(await processor(founderJob), { status: "updated" });
  const snapshot = await loadEmbeddingProfile(founderJob);
  assert.ok(snapshot);
  const saved = await getStoredEmbedding(founderJob);
  assert.equal(saved?.contentHash, hashEmbeddingText(snapshot.text));
  assert.equal(saved?.embedding.length, 384);
  assert.deepEqual(await processor(founderJob), { status: "unchanged" });
  assert.equal(generated.length, 1);

  const storedBeforeRace = saved?.contentHash;
  await saveFounderOnboarding(founderId, { ...founderInput, oneLiner: "Intermediate profile edit" }, true);
  const staleProcessor = createEmbeddingProcessor({
    load: loadEmbeddingProfile,
    getStored: getStoredEmbedding,
    store: storeEmbeddingIfCurrent,
    remove: deleteEmbeddingIfCurrent,
    generate: async () => {
      await saveFounderOnboarding(founderId, { ...founderInput, oneLiner: "Newest finance tools for founders" }, true);
      return Array.from({ length: 384 }, (_, index) => index === 1 ? 1 : 0);
    },
  });
  assert.deepEqual(await staleProcessor(founderJob), { status: "stale" });
  assert.equal((await getStoredEmbedding(founderJob))?.contentHash, storedBeforeRace);
  await saveFounderOnboarding(founderId, { ...founderInput, oneLiner: "Now building founder finance tools" }, true);
  const jobsAfterEdit = await embeddingQueue.getJobs(["delayed", "waiting", "paused", "active"], 0, 500);
  assert.equal(jobsAfterEdit.filter((job) => job.data.profileId === founderJob.profileId).length, 1);
  assert.deepEqual(await processor(founderJob), { status: "updated" });
  assert.equal(generated.length, 2);

  const mentorProcessor = createEmbeddingProcessor({
    load: loadEmbeddingProfile,
    getStored: getStoredEmbedding,
    store: storeEmbeddingIfCurrent,
    remove: deleteEmbeddingIfCurrent,
    generate: async () => Array.from({ length: 384 }, (_, index) => index === 0 ? 1 : 0),
  });
  assert.deepEqual(await mentorProcessor({ profileType: "mentor", profileId: mentorId }), { status: "updated" });
  const mentorSnapshot = await loadEmbeddingProfile({ profileType: "mentor", profileId: mentorId });
  assert.ok(mentorSnapshot?.text.includes(`Skills: ${skillOptions[1]!.name}`));
});
