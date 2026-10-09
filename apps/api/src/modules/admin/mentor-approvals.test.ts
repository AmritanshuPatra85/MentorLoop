import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import express from "express";
import { createApp } from "../../app";
import { db, pool } from "../../db/client";
import {
  domains,
  mentorDomains,
  mentorProfiles,
  mentorSkills,
  mentorStages,
  skills,
  stages,
  users,
} from "../../db/schema";
import { redis } from "../../lib/redis";
import { closeEmbeddingQueue } from "../embeddings/embedding.queue";
import { requireApproved } from "../../middleware/require-approved";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { signAccessToken } from "../auth/tokens";
import { bootstrapAdmin } from "../../scripts/bootstrap-admin";

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const accountEmails = {
  admin: `admin-${suffix}@example.com`,
  founder: `founder-${suffix}@kiit.ac.in`,
  pending: `pending-${suffix}@example.com`,
  rejected: `rejected-${suffix}@example.com`,
  otherPending: `other-${suffix}@example.com`,
  unverifiedAdmin: `unverified-admin-${suffix}@example.com`,
  bootstrap: `bootstrap-${suffix}@example.com`,
};
const accounts: Record<keyof typeof accountEmails, { id: string; token: string }> = {
  admin: { id: "", token: "" },
  founder: { id: "", token: "" },
  pending: { id: "", token: "" },
  rejected: { id: "", token: "" },
  otherPending: { id: "", token: "" },
  unverifiedAdmin: { id: "", token: "" },
  bootstrap: { id: "", token: "" },
};

let baseUrl = "";
let server: Server | undefined;
let taxonomy = {
  domainId: "",
  domainSlug: "",
  domainName: "",
  skillId: "",
  skillSlug: "",
  skillName: "",
  stageId: "",
  stageSlug: "",
  stageName: "",
};

before(async () => {
  const [domain] = await db
    .select({ id: domains.id, slug: domains.slug, name: domains.name })
    .from(domains)
    .limit(1);
  const [skill] = await db
    .select({ id: skills.id, slug: skills.slug, name: skills.name })
    .from(skills)
    .limit(1);
  const [stage] = await db
    .select({ id: stages.id, slug: stages.slug, name: stages.name })
    .from(stages)
    .limit(1);
  if (!domain || !skill || !stage) throw new Error("Run the taxonomy seed before tests");
  taxonomy = {
    domainId: domain.id,
    domainSlug: domain.slug,
    domainName: domain.name,
    skillId: skill.id,
    skillSlug: skill.slug,
    skillName: skill.name,
    stageId: stage.id,
    stageSlug: stage.slug,
    stageName: stage.name,
  };

  const baseAccounts = [
    ["admin", "Approval Admin", "admin", "active", true],
    ["founder", "Approval Founder", "founder", "active", true],
    ["pending", "Pending Mentor", "mentor", "pending_approval", true],
    ["rejected", "Rejected Mentor", "mentor", "pending_approval", true],
    ["otherPending", "Other Pending Mentor", "mentor", "pending_approval", true],
    ["unverifiedAdmin", "Unverified Admin", "admin", "active", false],
    ["bootstrap", "Bootstrap Admin", "founder", "active", true],
  ] as const;
  const created = await db
    .insert(users)
    .values(
      baseAccounts.map(([key, fullName, role, status, verified]) => ({
        email: accountEmails[key],
        fullName,
        role,
        status,
        ...(verified ? { emailVerifiedAt: new Date() } : {}),
        ...(key === "rejected"
          ? { rejectionReason: "Please add more detail about your mentoring experience." }
          : {}),
      })),
    )
    .returning({ id: users.id, email: users.email });
  for (const [key] of baseAccounts) {
    const user = created.find((row) => row.email === accountEmails[key]);
    assert.ok(user);
    accounts[key].id = user.id;
    accounts[key].token = await signAccessToken({
      id: user.id,
      role:
        key === "admin" || key === "unverifiedAdmin"
          ? "admin"
          : key === "founder" || key === "bootstrap"
            ? "founder"
            : "mentor",
    });
  }

  await db.insert(mentorProfiles).values([
    {
      userId: accounts.pending.id,
      currentRole: "Product adviser",
      organization: "MentorLoop Labs",
      yearsExperience: 12,
      bio: "A product mentor with extensive experience helping early-stage teams build products customers want.",
      experienceSummary:
        "Led product strategy and go-to-market at three early-stage software companies.",
      helpTopics: "Product discovery and customer interviews",
      maxMentees: 4,
      sessionLengthMinutes: 60,
      timezone: "Asia/Kolkata",
      preferredSessionTimes: [{ day: 2, start: "10:00", end: "12:00" }],
      isComplete: true,
    },
    {
      userId: accounts.rejected.id,
      currentRole: "Finance mentor",
      organization: "Independent",
      yearsExperience: 15,
      bio: "A finance mentor with experience helping founders understand finance, investment and business planning.",
      experienceSummary:
        "Advised growing organizations on finance and investment readiness for fifteen years.",
      helpTopics: "Financial planning and investment readiness",
      maxMentees: 3,
      sessionLengthMinutes: 45,
      timezone: "Asia/Kolkata",
      preferredSessionTimes: [{ day: 3, start: "11:00", end: "12:00" }],
      isComplete: true,
    },
    {
      userId: accounts.otherPending.id,
      bio: "An experienced mentor who helps founders make thoughtful early product decisions.",
      experienceSummary:
        "Helped early teams validate products and reach their first customers.",
      helpTopics: "Product validation and early customer discovery",
      maxMentees: 2,
      sessionLengthMinutes: 30,
      timezone: "Asia/Kolkata",
      preferredSessionTimes: [{ day: 4, start: "14:00", end: "15:00" }],
      isComplete: true,
    },
  ]);
  await db
    .insert(mentorDomains)
    .values({ mentorId: accounts.pending.id, domainId: domain.id });
  await db
    .insert(mentorSkills)
    .values({ mentorId: accounts.pending.id, skillId: skill.id });
  await db
    .insert(mentorStages)
    .values({ mentorId: accounts.pending.id, stageId: stage.id });

  const app = express();
  app.get(
    "/__test/mentor-feature",
    requireAuth,
    requireRole("mentor"),
    requireApproved,
    (_req, res) => {
      res.sendStatus(204);
    },
  );
  app.use(createApp());
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
  await db.delete(users).where(
    inArray(
      users.id,
      Object.values(accounts)
        .map((account) => account.id)
        .filter(Boolean),
    ),
  );
  await closeEmbeddingQueue();
  redis.disconnect();
  await pool.end();
});

function auth(account: { token: string }) {
  return { Authorization: `Bearer ${account.token}` };
}

test("approval queue is admin-only and returns full pending mentor profiles", async () => {
  assert.equal((await fetch(`${baseUrl}/admin/mentor-approvals`)).status, 401);
  for (const account of [accounts.founder, accounts.pending, accounts.unverifiedAdmin]) {
    assert.equal(
      (await fetch(`${baseUrl}/admin/mentor-approvals`, { headers: auth(account) }))
        .status,
      403,
    );
  }

  const response = await fetch(`${baseUrl}/admin/mentor-approvals`, {
    headers: auth(accounts.admin),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    applications: Array<{
      mentorId: string;
      fullName: string;
      status: string;
      domainNames: string[];
      skillNames: string[];
      stageNames: string[];
      preferredSessionTimes: unknown[];
    }>;
  };
  const application = body.applications.find(
    (item) => item.mentorId === accounts.pending.id,
  );
  assert.ok(application);
  assert.equal(application.fullName, "Pending Mentor");
  assert.equal(application.status, "pending_approval");
  assert.deepEqual(application.domainNames, [taxonomy.domainName]);
  assert.deepEqual(application.skillNames, [taxonomy.skillName]);
  assert.deepEqual(application.stageNames, [taxonomy.stageName]);
  assert.equal(application.preferredSessionTimes.length, 1);

  assert.equal(
    (
      await fetch(`${baseUrl}/admin/mentor-approvals`, {
        headers: auth(accounts.pending),
      })
    ).status,
    403,
  );
});

test("admin approval persists, unlocks approved mentor permissions, and cannot be duplicated", async () => {
  const headers = { ...auth(accounts.admin), "Content-Type": "application/json" };
  const pendingFeature = await fetch(`${baseUrl}/__test/mentor-feature`, {
    headers: auth(accounts.pending),
  });
  assert.equal(pendingFeature.status, 403);

  const response = await fetch(
    `${baseUrl}/admin/mentor-approvals/${accounts.pending.id}/approve`,
    { method: "POST", headers },
  );
  assert.equal(response.status, 200);
  const result = (await response.json()) as {
    status: string;
    rejectionReason: string | null;
  };
  assert.equal(result.status, "active");
  assert.equal(result.rejectionReason, null);
  assert.equal(
    (await fetch(`${baseUrl}/__test/mentor-feature`, { headers: auth(accounts.pending) }))
      .status,
    204,
  );

  const duplicate = await fetch(
    `${baseUrl}/admin/mentor-approvals/${accounts.pending.id}/approve`,
    { method: "POST", headers },
  );
  assert.equal(duplicate.status, 409);
  const [mentor] = await db
    .select()
    .from(users)
    .where(eq(users.id, accounts.pending.id))
    .limit(1);
  assert.equal(mentor?.status, "active");
  assert.equal(mentor?.role, "mentor");
});

test("reject requires a meaningful reason and the mentor can see their own reason", async () => {
  const headers = { ...auth(accounts.admin), "Content-Type": "application/json" };
  const noReason = await fetch(
    `${baseUrl}/admin/mentor-approvals/${accounts.rejected.id}/reject`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ reason: "  " }),
    },
  );
  assert.equal(noReason.status, 400);

  const response = await fetch(
    `${baseUrl}/admin/mentor-approvals/${accounts.rejected.id}/reject`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        reason: "Please add specific examples of mentoring outcomes.",
      }),
    },
  );
  assert.equal(response.status, 200);
  const result = (await response.json()) as {
    status: string;
    rejectionReason: string | null;
  };
  assert.equal(result.status, "rejected");
  assert.equal(
    result.rejectionReason,
    "Please add specific examples of mentoring outcomes.",
  );

  const ownMe = await fetch(`${baseUrl}/auth/me`, { headers: auth(accounts.rejected) });
  const ownBody = (await ownMe.json()) as {
    user: { status: string; rejectionReason: string | null };
  };
  assert.equal(ownBody.user.status, "rejected");
  assert.equal(ownBody.user.rejectionReason, result.rejectionReason);
  const otherMe = await fetch(`${baseUrl}/auth/me`, {
    headers: auth(accounts.otherPending),
  });
  const otherBody = (await otherMe.json()) as {
    user: { rejectionReason: string | null };
  };
  assert.equal(otherBody.user.rejectionReason, null);

  assert.equal(
    (
      await fetch(`${baseUrl}/admin/mentor-approvals/${accounts.rejected.id}/approve`, {
        method: "POST",
        headers,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await fetch(`${baseUrl}/admin/mentor-approvals/${accounts.rejected.id}/reject`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reason: "Duplicate decision reason." }),
      })
    ).status,
    409,
  );
});

test("rejected mentor can edit and resubmit, returning to pending without mentor access", async () => {
  const mentorHeaders = {
    ...auth(accounts.rejected),
    "Content-Type": "application/json",
  };
  const draft = await fetch(`${baseUrl}/mentor-onboarding/draft`, {
    method: "PUT",
    headers: mentorHeaders,
    body: JSON.stringify({ currentRole: "Updated mentor" }),
  });
  assert.equal(draft.status, 200);
  const incomplete = await fetch(`${baseUrl}/__test/mentor-feature`, {
    headers: auth(accounts.rejected),
  });
  assert.equal(incomplete.status, 403);

  const resubmitted = await fetch(`${baseUrl}/mentor-onboarding/complete`, {
    method: "POST",
    headers: mentorHeaders,
    body: JSON.stringify({
      currentRole: "Updated mentor",
      organization: "Independent",
      bio: "I have extensive experience helping founders make strong product decisions and build effective teams.",
      experienceSummary:
        "Worked with growing teams on product development, planning and customer research.",
      yearsExperience: 15,
      domainSlugs: [taxonomy.domainSlug],
      skillSlugs: [taxonomy.skillSlug],
      stageSlugs: [taxonomy.stageSlug],
      helpTopics: "Product planning and customer research for early-stage teams.",
      maxMentees: 3,
      sessionLengthMinutes: 45,
      timezone: "Asia/Kolkata",
      preferredSessionTimes: [{ day: 2, start: "10:00", end: "12:00" }],
    }),
  });
  assert.equal(resubmitted.status, 200);
  const body = (await resubmitted.json()) as {
    status: string;
    rejectionReason: string | null;
    profile: { isComplete: boolean };
  };
  assert.equal(body.status, "pending_approval");
  assert.equal(body.rejectionReason, null);
  assert.equal(body.profile.isComplete, true);
  assert.equal(
    (
      await fetch(`${baseUrl}/__test/mentor-feature`, {
        headers: auth(accounts.rejected),
      })
    ).status,
    403,
  );
  const me = await fetch(`${baseUrl}/auth/me`, { headers: auth(accounts.rejected) });
  const meBody = (await me.json()) as {
    user: { status: string; rejectionReason: string | null };
  };
  assert.equal(meBody.user.status, "pending_approval");
  assert.equal(meBody.user.rejectionReason, null);
});

test("concurrent decisions allow exactly one status transition", async () => {
  const headers = { ...auth(accounts.admin), "Content-Type": "application/json" };
  const decisions = await Promise.all([
    fetch(`${baseUrl}/admin/mentor-approvals/${accounts.otherPending.id}/approve`, {
      method: "POST",
      headers,
    }),
    fetch(`${baseUrl}/admin/mentor-approvals/${accounts.otherPending.id}/reject`, {
      method: "POST",
      headers,
      body: JSON.stringify({ reason: "Please clarify your experience with founders." }),
    }),
  ]);
  const statuses = decisions.map((response) => response.status).sort();
  assert.deepEqual(statuses, [200, 409]);
});

test("first-admin bootstrap promotes only an existing verified account and is idempotent", async () => {
  await assert.rejects(() => bootstrapAdmin(""));
  const first = await bootstrapAdmin(accountEmails.bootstrap);
  assert.equal(first.role, "admin");
  assert.equal(first.status, "active");
  const second = await bootstrapAdmin(accountEmails.bootstrap);
  assert.equal(second.role, "admin");
  assert.equal(second.status, "active");

  await assert.rejects(
    () => bootstrapAdmin(`missing-${suffix}@example.com`),
    /No account exists/,
  );
});
