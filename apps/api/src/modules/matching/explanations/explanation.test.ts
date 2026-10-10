import { describe, expect, it, vi } from "vitest";
import type { MatchResult } from "@mentorloop/shared";
import { buildTemplateExplanation } from "./explanation.template";
import { createMatchExplanationService } from "./explanation.attach";
import { createGroqExplanationGenerator, GROQ_EXPLANATION_MAX_COMPLETION_TOKENS } from "./explanation.groq";
import { createMatchExplanationProcessor, saveFinalAttemptFallback } from "./explanation.processor";
import type { MatchExplanationInput } from "./explanation.repository";

const signals: MatchResult["signals"] = {
  semanticSimilarity: { raw: 0.9, weight: 35, weighted: 0.315 },
  domainOverlap: { raw: 0.8, weight: 25, weighted: 0.2 },
  stageFit: { raw: 1, weight: 15, weighted: 0.15 },
  availabilityOverlap: { raw: 0.75, weight: 15, weighted: 0.1125 },
  trackRecord: { raw: 0.5, weight: 10, weighted: 0.05 },
};
const result: MatchResult = {
  candidateId: "00000000-0000-4000-8000-000000000001",
  score: 0.8275,
  signals,
  newMentorBoost: 0,
};
const facts = {
  mentorName: "Asha Rao",
  currentRole: "Product Director",
  organization: "Northstar",
  yearsExperience: 12,
  overlappingDomains: ["Fintech", "SaaS"],
  startupStages: ["Seed"],
  mentorStages: ["Seed"],
  hasAvailabilityPreferences: true,
};
const input: MatchExplanationInput = {
  startupId: "00000000-0000-4000-8000-000000000010",
  mentorId: result.candidateId,
  startupContentHash: "startup-hash",
  mentorContentHash: "mentor-hash",
  facts,
  signals,
};
const job = {
  startupId: input.startupId,
  mentorId: input.mentorId,
  startupContentHash: input.startupContentHash!,
  mentorContentHash: input.mentorContentHash!,
  facts,
  signals,
};

function service(overrides: Partial<Parameters<typeof createMatchExplanationService>[0]> = {}) {
  const enqueue = vi.fn(async () => undefined);
  const dependencies = {
    loadInputs: vi.fn(async () => [input]),
    readCache: vi.fn(async () => new Map()),
    enqueue,
    seedTemplate: vi.fn(async () => undefined),
    queueError: vi.fn(),
    ...overrides,
  };
  return { explain: createMatchExplanationService(dependencies), dependencies };
}

describe("match explanation templates and request behavior", () => {
  it("builds a deterministic, plain-English two-sentence fallback from facts and scores", () => {
    const template = buildTemplateExplanation(facts, signals);
    expect(template).toBe(buildTemplateExplanation(facts, signals));
    expect(template).toContain("Asha Rao is Product Director at Northstar with 12 years of experience.");
    expect(template).toContain("Fintech, SaaS");
    expect(template).toContain("75% of the preferred session windows");
    expect(template).toContain("track-record signal is neutral");
    expect(template.match(/[.!?](?:\s|$)/g)).toHaveLength(2);
  });

  it("uses cached text and source without enqueueing work", async () => {
    const { explain, dependencies } = service({
      readCache: vi.fn(async () => new Map([["startup-hash:mentor-hash", { explanation: "Cached first sentence. Cached second sentence.", source: "groq" as const, model: "openai/gpt-oss-20b" }]])),
    });
    const matches = await explain("founder-id", [result]);
    expect(matches[0]?.explanation).toEqual({ text: "Cached first sentence. Cached second sentence.", source: "groq" });
    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });

  it("returns the template on a cache miss and only enqueues top ten uncached results", async () => {
    const ranked = Array.from({ length: 12 }, (_, index) => ({
      ...result,
      candidateId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    }));
    const inputs = ranked.map((match, index) => ({ ...input, mentorId: match.candidateId, mentorContentHash: `mentor-${index}` }));
    const { explain, dependencies } = service({
      loadInputs: vi.fn(async () => inputs),
      readCache: vi.fn(async () => new Map([
        ["startup-hash:mentor-0", { explanation: "Cached. Explanation.", source: "groq" as const, model: "openai/gpt-oss-20b" }],
        ["startup-hash:mentor-1", { explanation: "Cached. Explanation.", source: "groq" as const, model: "openai/gpt-oss-20b" }],
      ])),
    });
    const matches = await explain("founder-id", ranked);
    expect(matches[0]?.explanation.source).toBe("groq");
    expect(matches[2]?.explanation.source).toBe("template");
    expect(matches[2]?.explanation.text).toBe(buildTemplateExplanation(facts, signals));
    expect(dependencies.enqueue).toHaveBeenCalledTimes(10);
    expect(dependencies.enqueue).not.toHaveBeenCalledWith(expect.objectContaining({ mentorId: ranked[0]!.candidateId }));
    expect(dependencies.enqueue).not.toHaveBeenCalledWith(expect.objectContaining({ mentorId: ranked[1]!.candidateId }));
    await vi.waitFor(() => expect(dependencies.seedTemplate).toHaveBeenCalledTimes(10));
  });
});

describe("Groq generation and worker fallback", () => {
  it("requests low reasoning effort with enough completion-token headroom", async () => {
    const createCompletion = vi.fn(async () => ({ choices: [{ message: { content: "The mentor works in product at Northstar. Your domain and stage signals align well." } }] }));
    const generate = createGroqExplanationGenerator(createCompletion, "openai/gpt-oss-20b");
    const generated = await generate(facts, signals);
    expect(generated).toContain("domain and stage");
    expect(createCompletion).toHaveBeenCalledWith(expect.objectContaining({
      model: "openai/gpt-oss-20b",
      reasoning_effort: "low",
      max_completion_tokens: GROQ_EXPLANATION_MAX_COMPLETION_TOKENS,
    }));
  });

  it("treats empty Groq completion as a failure", async () => {
    const createCompletion = vi.fn(async () => ({ choices: [{ message: { content: "  " } }] }));
    const generate = createGroqExplanationGenerator(createCompletion, "openai/gpt-oss-20b");
    await expect(generate(facts, signals)).rejects.toMatchObject({ code: "GROQ_EMPTY_COMPLETION" });
  });

  it("persists the deterministic fallback after Groq retries fail", async () => {
    const generate = vi.fn(async () => { throw new Error("mock Groq unavailable"); });
    const save = vi.fn(async () => true);
    const isCurrent = vi.fn(async () => true);
    const processor = createMatchExplanationProcessor({ hasApiKey: true, isCurrent, generate, save, model: "openai/gpt-oss-20b" });
    await expect(processor(job)).rejects.toThrow("mock Groq unavailable");
    await saveFinalAttemptFallback(job, save, isCurrent);
    expect(save).toHaveBeenCalledWith(job, buildTemplateExplanation(facts, signals), "template", null);
  });

  it("stores and returns the template in template-only mode when no API key is configured", async () => {
    const generate = vi.fn(async () => "should not run");
    const save = vi.fn(async () => true);
    const processor = createMatchExplanationProcessor({
      hasApiKey: false,
      isCurrent: vi.fn(async () => true),
      generate,
      save,
      model: "openai/gpt-oss-20b",
    });
    await expect(processor(job)).resolves.toEqual({ status: "template" });
    expect(generate).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(job, buildTemplateExplanation(facts, signals), "template", null);
  });
});
