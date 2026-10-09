import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { createApp } from "../../app";
import { db, pool } from "../../db/client";
import { domains, mentorProfiles, skills, stages, users } from "../../db/schema";
import { redis } from "../../lib/redis";
import { closeEmbeddingQueue, embeddingQueue } from "../embeddings/embedding.queue";
import { signAccessToken } from "../auth/tokens";

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const accounts = {
  mentor: { email: `mentor-${suffix}@example.com`, id: "", token: "" },
  founder: { email: `founder-${suffix}@kiit.ac.in`, id: "", token: "" },
  unverified: { email: `unverified-${suffix}@example.com`, id: "", token: "" },
  activeMentor: { email: `active-${suffix}@example.com`, id: "", token: "" },
};
let baseUrl = "";
let server: Server | undefined;
let signupUserId = "";
let fixture: {
  domainSlug: string;
  skillSlug: string;
  stageSlug: string;
  founderName: string;
};

before(async () => {
  const [domain] = await db.select({ slug: domains.slug }).from(domains).limit(1);
  const [skill] = await db.select({ slug: skills.slug }).from(skills).limit(1);
  const [stage] = await db.select({ slug: stages.slug }).from(stages).limit(1);
  if (!domain || !skill || !stage)
    throw new Error("Run the taxonomy seed before mentor onboarding tests");

  const created = await db
    .insert(users)
    .values([
      {
        email: accounts.mentor.email,
        emailVerifiedAt: new Date(),
        fullName: "Mentor Onboarding Test",
        role: "mentor",
        status: "pending_approval",
      },
      {
        email: accounts.founder.email,
        emailVerifiedAt: new Date(),
        fullName: "Founder Onboarding Test",
        role: "founder",
        status: "active",
      },
      {
        email: accounts.unverified.email,
        fullName: "Unverified Mentor Test",
        role: "mentor",
        status: "pending_approval",
      },
      {
        email: accounts.activeMentor.email,
        emailVerifiedAt: new Date(),
        fullName: "Approved Mentor Test",
        role: "mentor",
        status: "active",
      },
    ])
    .returning({ id: users.id, email: users.email });

  for (const account of Object.values(accounts)) {
    const user = created.find((row) => row.email === account.email);
    assert.ok(user);
    account.id = user.id;
    account.token = await signAccessToken({
      id: user.id,
      role: account === accounts.founder ? "founder" : "mentor",
    });
  }
  fixture = {
    domainSlug: domain.slug,
    skillSlug: skill.slug,
    stageSlug: stage.slug,
    founderName: "Founder Onboarding Test",
  };

  const app = createApp();
  await new Promise<void>((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => {
      server = listener;
      const address = listener.address();
      if (!address || typeof address === "string")
        return reject(new Error("Could not bind test API"));
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
    listener.once("error", reject);
  });
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    );
  }
  const ids = Object.values(accounts)
    .map((account) => account.id)
    .filter(Boolean);
  if (signupUserId) ids.push(signupUserId);
  const jobs = await embeddingQueue.getJobs(["delayed", "waiting", "paused", "active"], 0, 1_000);
  for (const job of jobs.filter((candidate) => ids.includes(candidate.data.profileId)))
    await job.remove().catch(() => undefined);
  if (ids.length) await db.delete(users).where(inArray(users.id, ids));
  await closeEmbeddingQueue();
  redis.disconnect();
  await pool.end();
});

function auth(account: { token: string }) {
  return { Authorization: `Bearer ${account.token}` };
}

const completeInput = () => ({
  currentRole: "Product leader",
  organization: "MentorLoop Test Co",
  bio: "I have spent my career building products and helping early teams find a clear path to customers.",
  experienceSummary:
    "Led product and go-to-market work across early-stage software companies for more than a decade.",
  yearsExperience: 12,
  domainSlugs: [fixture.domainSlug],
  skillSlugs: [fixture.skillSlug],
  stageSlugs: [fixture.stageSlug],
  helpTopics:
    "Product discovery, go-to-market planning, and early customer conversations.",
  maxMentees: 4,
  sessionLengthMinutes: 60,
  timezone: "Asia/Kolkata",
  preferredSessionTimes: [{ day: 2, start: "10:00", end: "12:00" }],
  linkedinUrl: "https://linkedin.com/in/mentor-test",
  websiteUrl: "https://example.com/mentor-test",
});

test("pending verified mentor can load an empty profile and save a resumable draft", async () => {
  const initial = await fetch(`${baseUrl}/mentor-onboarding`, {
    headers: auth(accounts.mentor),
  });
  assert.equal(initial.status, 200);
  assert.equal(((await initial.json()) as { profile: unknown }).profile, null);

  const response = await fetch(`${baseUrl}/mentor-onboarding/draft`, {
    method: "PUT",
    headers: { ...auth(accounts.mentor), "Content-Type": "application/json" },
    body: JSON.stringify({ currentRole: "Product leader", bio: "Draft bio" }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    profile: { currentRole: string; isComplete: boolean };
  };
  assert.equal(body.profile.currentRole, "Product leader");
  assert.equal(body.profile.isComplete, false);
});

test("new mentor signup can request and confirm its first OTP from the verification page", async () => {
  const registered = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "OTP Signup Test",
      email: `otp-${suffix}@example.com`,
      password: "mentor-loop-test-password",
      role: "mentor",
    }),
  });
  assert.equal(registered.status, 201);
  const session = (await registered.json()) as {
    accessToken: string;
    user: { id: string; emailVerified: boolean; status: string };
  };
  signupUserId = session.user.id;
  assert.equal(session.user.emailVerified, false);
  assert.equal(session.user.status, "pending_approval");

  const requested = await fetch(`${baseUrl}/auth/verify-email/request`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  assert.equal(requested.status, 202);
  const otp = (await requested.json()) as { devCode?: string };
  assert.match(otp.devCode ?? "", /^\d{6}$/);

  const confirmed = await fetch(`${baseUrl}/auth/verify-email/confirm`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: otp.devCode }),
  });
  assert.equal(confirmed.status, 200);
  const result = (await confirmed.json()) as {
    user: { emailVerified: boolean; status: string };
  };
  assert.equal(result.user.emailVerified, true);
  assert.equal(result.user.status, "pending_approval");
});

test("server rejects incomplete completion and keeps unknown privileged fields out", async () => {
  const invalid = await fetch(`${baseUrl}/mentor-onboarding/complete`, {
    method: "POST",
    headers: { ...auth(accounts.mentor), "Content-Type": "application/json" },
    body: JSON.stringify({ bio: "Too short" }),
  });
  assert.equal(invalid.status, 400);

  const submitted = {
    ...completeInput(),
    userId: accounts.founder.id,
    role: "admin",
    status: "active",
  };
  const response = await fetch(`${baseUrl}/mentor-onboarding/complete`, {
    method: "POST",
    headers: { ...auth(accounts.mentor), "Content-Type": "application/json" },
    body: JSON.stringify(submitted),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    profile: { isComplete: boolean; mentorName: string };
  };
  assert.equal(body.profile.isComplete, true);
  assert.equal(body.profile.mentorName, "Mentor Onboarding Test");

  const [mentor] = await db
    .select()
    .from(users)
    .where(eq(users.id, accounts.mentor.id))
    .limit(1);
  assert.equal(mentor?.role, "mentor");
  assert.equal(mentor?.status, "pending_approval");
  assert.equal(mentor?.id, accounts.mentor.id);
  const [saved] = await db
    .select()
    .from(mentorProfiles)
    .where(eq(mentorProfiles.userId, accounts.mentor.id))
    .limit(1);
  assert.equal(saved?.isComplete, true);
  assert.equal(saved?.userId, accounts.mentor.id);
  const [wrongOwner] = await db
    .select()
    .from(mentorProfiles)
    .where(eq(mentorProfiles.userId, accounts.founder.id))
    .limit(1);
  assert.equal(wrongOwner, undefined);
});

test("profile persists across a refreshed access token and repeated submissions do not duplicate it", async () => {
  const refreshedToken = await signAccessToken({
    id: accounts.mentor.id,
    role: "mentor",
  });
  const response = await fetch(`${baseUrl}/mentor-onboarding`, {
    headers: { Authorization: `Bearer ${refreshedToken}` },
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    profile: { isComplete: boolean; domainSlugs: string[]; skillSlugs: string[] };
  };
  assert.equal(body.profile.isComplete, true);
  assert.deepEqual(body.profile.domainSlugs, [fixture.domainSlug]);
  assert.deepEqual(body.profile.skillSlugs, [fixture.skillSlug]);

  const repeated = await fetch(`${baseUrl}/mentor-onboarding/complete`, {
    method: "POST",
    headers: { ...auth(accounts.mentor), "Content-Type": "application/json" },
    body: JSON.stringify(completeInput()),
  });
  assert.equal(repeated.status, 200);
  const rows = await db
    .select()
    .from(mentorProfiles)
    .where(eq(mentorProfiles.userId, accounts.mentor.id));
  assert.equal(rows.length, 1);
});

test("role, verification and account-state guards remain enforced", async () => {
  const noAuth = await fetch(`${baseUrl}/mentor-onboarding`);
  assert.equal(noAuth.status, 401);

  const founderAttempt = await fetch(`${baseUrl}/mentor-onboarding`, {
    headers: auth(accounts.founder),
  });
  assert.equal(founderAttempt.status, 403);

  const unverifiedAttempt = await fetch(`${baseUrl}/mentor-onboarding`, {
    headers: auth(accounts.unverified),
  });
  assert.equal(unverifiedAttempt.status, 403);

  const approvedAttempt = await fetch(`${baseUrl}/mentor-onboarding`, {
    headers: auth(accounts.activeMentor),
  });
  assert.equal(approvedAttempt.status, 403);

  const founderProfile = await fetch(`${baseUrl}/founder-onboarding`, {
    headers: auth(accounts.founder),
  });
  assert.equal(founderProfile.status, 200);
  assert.equal(((await founderProfile.json()) as { profile: unknown }).profile, null);
});
