import { env } from "../../../config/env";
import { generateGroqExplanation } from "./explanation.groq";
import { isMatchExplanationVersionCurrent, upsertMatchExplanation } from "./explanation.repository";
import { buildTemplateExplanation } from "./explanation.template";
import type { MatchExplanationJobData } from "./explanation.types";

export type ExplanationProcessorDependencies = {
  hasApiKey: boolean;
  isCurrent: (job: MatchExplanationJobData) => Promise<boolean>;
  generate: ((facts: MatchExplanationJobData["facts"], signals: MatchExplanationJobData["signals"]) => Promise<string>) | null;
  save: (job: MatchExplanationJobData, text: string, source: "groq" | "template", model: string | null) => Promise<boolean>;
  model: string;
};

export function createMatchExplanationProcessor(dependencies: ExplanationProcessorDependencies) {
  return async (job: MatchExplanationJobData) => {
    if (!await dependencies.isCurrent(job)) return { status: "stale" as const };
    if (!dependencies.hasApiKey || !dependencies.generate) {
      await dependencies.save(job, buildTemplateExplanation(job.facts, job.signals), "template", null);
      return { status: "template" as const };
    }
    const explanation = await dependencies.generate(job.facts, job.signals);
    const saved = await dependencies.save(job, explanation, "groq", dependencies.model);
    return { status: saved ? "groq" as const : "stale" as const };
  };
}

export async function saveFinalAttemptFallback(
  job: MatchExplanationJobData,
  save: ExplanationProcessorDependencies["save"],
  isCurrent: ExplanationProcessorDependencies["isCurrent"],
): Promise<boolean> {
  if (!await isCurrent(job)) return false;
  return save(job, buildTemplateExplanation(job.facts, job.signals), "template", null);
}

export const processMatchExplanation = createMatchExplanationProcessor({
  hasApiKey: !!env.GROQ_API_KEY,
  isCurrent: isMatchExplanationVersionCurrent,
  generate: generateGroqExplanation,
  save: upsertMatchExplanation,
  model: env.GROQ_EXPLAIN_MODEL,
});
