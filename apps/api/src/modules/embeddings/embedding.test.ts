import assert from "node:assert/strict";
import { test } from "node:test";
import { EmbeddingError, EmbeddingService } from "./embedding.service";
import { buildMentorEmbeddingText, buildStartupEmbeddingText } from "./profile-text";

test("startup text is stable, ordered, normalized and omits empty fields", () => {
  const profile = { name: "  Acme\n Labs ", oneLiner: "  Build   tools ", domainNames: ["AI", " Fintech", "AI", null], stageName: "Seed" };
  const expected = "Startup: Acme Labs\nPitch: Build tools\nDomains: AI, Fintech\nStage: Seed";
  assert.equal(buildStartupEmbeddingText(profile), expected);
  assert.equal(buildStartupEmbeddingText(profile), buildStartupEmbeddingText({ ...profile }));
  assert.equal(buildStartupEmbeddingText({ name: "  " }), "");
});

test("mentor text is deterministic and only uses matching profile content", () => {
  const profile = { currentRole: "CTO", organization: "Example", bio: "Mentors founders", yearsExperience: 12, skillNames: ["Product", "AI"], mentorshipStageNames: ["Seed"] };
  const expected = "Role: CTO\nOrganization: Example\nBiography: Mentors founders\nYears of experience: 12 years\nSkills: AI, Product\nMentorship stages: Seed";
  assert.equal(buildMentorEmbeddingText(profile), expected);
  assert.equal(buildMentorEmbeddingText(profile), buildMentorEmbeddingText({ ...profile }));
  assert.equal(buildMentorEmbeddingText({ yearsExperience: -1, skillNames: [null, ""] }), "");
});

test("embedding service returns exactly 384 finite normalized numbers", async () => {
  let loads = 0;
  const service = new EmbeddingService(async () => {
    loads++;
    return async () => ({ dims: [1, 384], data: Array.from({ length: 384 }, (_, i) => i + 1) });
  });
  const [first, second] = await Promise.all([service.generate("profile"), service.generate("other")]);
  assert.equal(loads, 1);
  assert.equal(first.length, 384);
  assert.ok(first.every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(...first) - 1) < 1e-12);
  assert.equal(second.length, 384);
});

test("invalid shape, non-finite and zero model output are rejected", async () => {
  for (const output of [
    { dims: [1, 383], data: Array(383).fill(1) },
    { dims: [1, 384], data: [Number.NaN, ...Array(383).fill(1)] },
    { dims: [1, 384], data: Array(384).fill(0) },
  ]) {
    const service = new EmbeddingService(async () => async () => output);
    await assert.rejects(service.generate("profile"), EmbeddingError);
  }
  await assert.rejects(new EmbeddingService().generate(" \n "), /empty profile/);
});

test("failed initialization is reported and can be retried", async () => {
  let loads = 0;
  const service = new EmbeddingService(async () => {
    if (loads++ === 0) throw new Error("offline");
    return async () => ({ dims: [1, 384], data: Array(384).fill(1) });
  });
  await assert.rejects(service.generate("profile"), /initialize/);
  assert.equal((await service.generate("profile")).length, 384);
  assert.equal(loads, 2);
});
