import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { createApp } from "../../app";
import { db, pool } from "../../db/client";
import {
  domains,
  mentorProfiles,
  skills,
  stages,
  startups,
  users,
} from "../../db/schema";
import { redis } from "../../lib/redis";
import { closeEmbeddingQueue, embeddingQueue } from "../embeddings/embedding.queue";
import { signAccessToken } from "../auth/tokens";
import { avatarDirectory } from "./profiles.routes";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const testAccounts = [
  {
    email: `founder-${suffix}@kiit.ac.in`,
    role: "founder" as const,
    status: "active" as const,
    fullName: "Profile Founder",
  },
  {
    email: `other-${suffix}@kiit.ac.in`,
    role: "founder" as const,
    status: "active" as const,
    fullName: "Other Founder",
  },
  {
    email: `mentor-${suffix}@example.com`,
    role: "mentor" as const,
    status: "pending_approval" as const,
    fullName: "Profile Mentor",
  },
  {
    email: `private-${suffix}@example.com`,
    role: "mentor" as const,
    status: "pending_approval" as const,
    fullName: "Private Mentor",
  },
];
const accounts: Array<{ id: string; email: string; role: string; token: string }> = [];
let baseUrl = "";
let server: Server | undefined;
let domainSlug = "";
let skillSlug = "";
let stageSlug = "";
let startupId = "";
let avatarName = "";

function auth(index: number) {
  return { Authorization: `Bearer ${accounts[index]!.token}` };
}
function jsonAuth(index: number) {
  return { ...auth(index), "Content-Type": "application/json" };
}

before(async () => {
  const [domain] = await db.select({ slug: domains.slug }).from(domains).limit(1);
  const [skill] = await db.select({ slug: skills.slug }).from(skills).limit(1);
  const [stage] = await db.select({ slug: stages.slug }).from(stages).limit(1);
  if (!domain || !skill || !stage)
    throw new Error("Run the taxonomy seed before profile tests");
  domainSlug = domain.slug;
  skillSlug = skill.slug;
  stageSlug = stage.slug;
  const created = await db
    .insert(users)
    .values(
      testAccounts.map((account) => ({
        ...account,
        emailVerifiedAt: new Date(),
      })),
    )
    .returning({ id: users.id, email: users.email, role: users.role });
  for (const account of created)
    accounts.push({
      ...account,
      token: await signAccessToken({ id: account.id, role: account.role }),
    });
  const app = createApp();
  await new Promise<void>((resolveListen, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => {
      server = listener;
      const address = listener.address();
      if (!address || typeof address === "string")
        return reject(new Error("Could not bind profile test API"));
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolveListen();
    });
    listener.once("error", reject);
  });

  const founderInput = {
    founderTitle: "Founder",
    linkedinUrl: "https://linkedin.com/in/profile-founder",
    startupName: "Private Test Startup",
    oneLiner: "A concise product pitch for the market.",
    description:
      "A complete startup description long enough to make this profile visible publicly.",
    domainSlugs: [domainSlug],
    primaryDomainSlug: domainSlug,
    stageSlug,
    helpNeeded: "Help us validate and grow the early customer pipeline.",
    goals: "Reach product market fit with a steady set of customers.",
    timezone: "Asia/Kolkata",
    preferredSessionTimes: [{ day: 1, start: "10:00", end: "11:00" }],
  };
  const { saveFounderOnboarding } =
    await import("../founder-onboarding/founder-onboarding.service");
  await saveFounderOnboarding(accounts[0]!.id, founderInput, true);
  const [startup] = await db
    .select({ id: startups.id })
    .from(startups)
    .where(eq(startups.founderId, accounts[0]!.id))
    .limit(1);
  assert.ok(startup);
  startupId = startup.id;

  const mentorComplete = {
    currentRole: "Product leader",
    organization: "Profile Co",
    bio: "A professional mentor bio that describes a long history helping founders build sustainable businesses.",
    experienceSummary:
      "Over twelve years leading product teams and supporting companies in the startup ecosystem.",
    yearsExperience: 12,
    domainSlugs: [domainSlug],
    skillSlugs: [skillSlug],
    stageSlugs: [stageSlug],
    helpTopics: "Product planning, customer discovery, and early go-to-market strategy.",
    maxMentees: 4,
    sessionLengthMinutes: 60 as const,
    timezone: "Asia/Kolkata",
    preferredSessionTimes: [{ day: 2, start: "10:00", end: "11:00" }],
    linkedinUrl: "https://linkedin.com/in/profile-mentor",
    websiteUrl: "https://example.com/mentor",
  };
  const { saveMentorOnboarding } =
    await import("../mentor-onboarding/mentor-onboarding.service");
  await saveMentorOnboarding(accounts[2]!.id, mentorComplete, true);
  await db.update(users).set({ status: "active" }).where(eq(users.id, accounts[2]!.id));
  await saveMentorOnboarding(accounts[3]!.id, { bio: "Private draft" }, false);
});

after(async () => {
  if (avatarName)
    await unlink(resolve(avatarDirectory, avatarName)).catch(() => undefined);
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolveClose, reject) =>
      server!.close((error) => (error ? reject(error) : resolveClose())),
    );
  }
  const profileIds = [...accounts.map((account) => account.id), startupId];
  const jobs = await embeddingQueue.getJobs(["delayed", "waiting", "paused", "active"], 0, 1_000);
  for (const job of jobs.filter((candidate) => profileIds.includes(candidate.data.profileId)))
    await job.remove().catch(() => undefined);
  if (accounts.length)
    await db.delete(users).where(
      inArray(
        users.id,
        accounts.map((a) => a.id),
      ),
    );
  await closeEmbeddingQueue();
  redis.disconnect();
  await pool.end();
});

test("founder edits only their own startup profile and values persist", async () => {
  const response = await fetch(`${baseUrl}/profiles/me`, {
    method: "PUT",
    headers: jsonAuth(0),
    body: JSON.stringify({
      startupName: "Updated Startup Name",
      goals: "Reach a sustainable first cohort of customers.",
    }),
  });
  assert.equal(response.status, 200);
  const saved = await fetch(`${baseUrl}/profiles/me`, { headers: auth(0) });
  const body = (await saved.json()) as {
    profile: { startupName: string; goals: string };
  };
  assert.equal(body.profile.startupName, "Updated Startup Name");
  assert.equal(body.profile.goals, "Reach a sustainable first cohort of customers.");
  const [otherStartup] = await db
    .select({ id: startups.id })
    .from(startups)
    .where(eq(startups.founderId, accounts[1]!.id))
    .limit(1);
  assert.equal(otherStartup, undefined);
});

test("founder cannot submit ownership, role, or approval fields", async () => {
  const response = await fetch(`${baseUrl}/profiles/me`, {
    method: "PUT",
    headers: jsonAuth(0),
    body: JSON.stringify({
      startupName: "Spoof",
      founderId: accounts[1]!.id,
      role: "admin",
      status: "active",
    }),
  });
  assert.equal(response.status, 400);
});

test("approved mentor may edit profile fields without changing role or approval state", async () => {
  const response = await fetch(`${baseUrl}/profiles/me`, {
    method: "PUT",
    headers: jsonAuth(2),
    body: JSON.stringify({
      currentRole: "Updated Product Leader",
      bio: "This edited biography remains professional and contains enough detail about mentoring startup founders.",
    }),
  });
  assert.equal(response.status, 200);
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, accounts[2]!.id))
    .limit(1);
  const [profile] = await db
    .select()
    .from(mentorProfiles)
    .where(eq(mentorProfiles.userId, accounts[2]!.id))
    .limit(1);
  assert.equal(user?.role, "mentor");
  assert.equal(user?.status, "active");
  assert.equal(profile?.currentRole, "Updated Product Leader");
  const spoof = await fetch(`${baseUrl}/profiles/me`, {
    method: "PUT",
    headers: jsonAuth(2),
    body: JSON.stringify({
      currentRole: "Spoofed",
      role: "admin",
      status: "pending_approval",
    }),
  });
  assert.equal(spoof.status, 400);
  const [unchanged] = await db
    .select({ role: users.role, status: users.status })
    .from(users)
    .where(eq(users.id, accounts[2]!.id))
    .limit(1);
  assert.equal(unchanged?.role, "mentor");
  assert.equal(unchanged?.status, "active");
});

test("public mentor endpoint allowlists fields and hides unapproved mentors", async () => {
  const active = await fetch(`${baseUrl}/profiles/mentors/${accounts[2]!.id}`);
  assert.equal(active.status, 200);
  const profile = (await active.json()) as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(profile).sort(),
    [
      "avatarUrl",
      "bio",
      "currentRole",
      "domains",
      "experienceSummary",
      "linkedinUrl",
      "mentorshipStages",
      "name",
      "organization",
      "skills",
      "websiteUrl",
      "yearsExperience",
    ].sort(),
  );
  assert.equal("email" in profile, false);
  assert.equal("id" in profile, false);
  assert.equal("timezone" in profile, false);
  assert.equal("helpTopics" in profile, false);
  const pending = await fetch(`${baseUrl}/profiles/mentors/${accounts[3]!.id}`);
  assert.equal(pending.status, 404);
});

test("public startup endpoint returns only approved public fields", async () => {
  const response = await fetch(`${baseUrl}/profiles/startups/${startupId}`);
  assert.equal(response.status, 200);
  const profile = (await response.json()) as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(profile).sort(),
    ["avatarUrl", "description", "domains", "id", "name", "oneLiner", "stage"].sort(),
  );
  assert.equal("founderId" in profile, false);
  assert.equal("goals" in profile, false);
});

test("avatar upload rejects invalid and oversized data, then persists a safe owned URL", async () => {
  const invalid = await fetch(`${baseUrl}/profiles/me/avatar`, {
    method: "POST",
    headers: jsonAuth(0),
    body: JSON.stringify({
      mimeType: "image/png",
      data: Buffer.from("not an image").toString("base64"),
    }),
  });
  assert.equal(invalid.status, 400);
  const tooLargeData = Buffer.alloc(512 * 1024 + 1, 1).toString("base64");
  const oversized = await fetch(`${baseUrl}/profiles/me/avatar`, {
    method: "POST",
    headers: jsonAuth(0),
    body: JSON.stringify({ mimeType: "image/png", data: tooLargeData }),
  });
  assert.equal(oversized.status, 400);
  const pngImage = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p6sAAAAASUVORK5CYII=",
    "base64",
  );
  const uploaded = await fetch(`${baseUrl}/profiles/me/avatar`, {
    method: "POST",
    headers: jsonAuth(0),
    body: JSON.stringify({ mimeType: "image/png", data: pngImage.toString("base64") }),
  });
  assert.equal(uploaded.status, 200);
  const result = (await uploaded.json()) as { avatarUrl: string };
  assert.match(result.avatarUrl, /^\/uploads\/avatars\/[0-9a-f-]{36}\.png$/i);
  avatarName = result.avatarUrl.split("/").at(-1)!;
  const file = await fetch(`${baseUrl}${result.avatarUrl}`);
  assert.equal(file.status, 200);
  const [owner] = await db
    .select({ avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, accounts[0]!.id))
    .limit(1);
  const [other] = await db
    .select({ avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, accounts[1]!.id))
    .limit(1);
  assert.equal(owner?.avatarUrl, result.avatarUrl);
  assert.equal(other?.avatarUrl, null);
});

test("profile routes require authentication", async () => {
  assert.equal((await fetch(`${baseUrl}/profiles/me`)).status, 401);
});
