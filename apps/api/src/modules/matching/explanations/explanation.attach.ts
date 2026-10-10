import type { MatchResult } from "@mentorloop/shared";
import { explanationPairKey, type MatchExplanationInput } from "./explanation.repository";
import { buildTemplateExplanation } from "./explanation.template";
import type { MatchExplanationJobData } from "./explanation.types";

export type ExplanationServiceDependencies = {
  loadInputs: (founderId: string, ranked: MatchResult[]) => Promise<MatchExplanationInput[]>;
  readCache: (inputs: MatchExplanationInput[]) => Promise<Map<string, { explanation: string; source: "groq" | "template"; model: string | null }>>;
  enqueue: (job: MatchExplanationJobData) => Promise<void>;
  seedTemplate: (job: MatchExplanationJobData, explanation: string) => Promise<void>;
  queueError: (error: unknown, jobId: string) => void;
};

export function createMatchExplanationService(dependencies: ExplanationServiceDependencies) {
  return async (founderId: string, ranked: MatchResult[]) => {
    if (!ranked.length) return [];
    const inputs = await dependencies.loadInputs(founderId, ranked);
    const cache = await dependencies.readCache(inputs);
    const inputsByMentor = new Map(inputs.map((item) => [item.mentorId, item]));
    let enqueuedCount = 0;
    return ranked.map((match) => {
      const input = inputsByMentor.get(match.candidateId);
      if (!input) {
        const noFacts = {
          mentorName: "This mentor", currentRole: null, organization: null, yearsExperience: null,
          overlappingDomains: [], startupStages: [], mentorStages: [], hasAvailabilityPreferences: false,
        };
        return { ...match, explanation: { text: buildTemplateExplanation(noFacts, match.signals), source: "template" as const } };
      }
      const hasVersionKey = !!input.startupContentHash && !!input.mentorContentHash;
      const cacheKey = hasVersionKey ? explanationPairKey(input.startupContentHash!, input.mentorContentHash!) : "";
      const cached = cache.get(cacheKey);
      if (cached) return { ...match, explanation: { text: cached.explanation, source: cached.source } };

      const fallback = buildTemplateExplanation(input.facts, match.signals);
      if (hasVersionKey && enqueuedCount < 10) {
        const job: MatchExplanationJobData = {
          startupId: input.startupId,
          mentorId: input.mentorId,
          startupContentHash: input.startupContentHash!,
          mentorContentHash: input.mentorContentHash!,
          facts: input.facts,
          signals: match.signals,
        };
        enqueuedCount++;
        const jobId = `${job.startupContentHash}:${job.mentorContentHash}`;
        // Queue I/O is deliberately fire-and-forget; match delivery never waits for Groq or Redis.
        void dependencies.enqueue(job)
          .then(() => dependencies.seedTemplate(job, fallback))
          .catch((error: unknown) => dependencies.queueError(error, jobId));
      }
      return { ...match, explanation: { text: fallback, source: "template" as const } };
    });
  };
}
