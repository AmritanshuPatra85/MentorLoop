import { createHash } from "node:crypto";
import { Queue } from "bullmq";
import { redis } from "../../../lib/redis";
import type { MatchExplanationJobData } from "./explanation.types";

export const MATCH_EXPLANATION_QUEUE_NAME = "match-explanations";
export const matchExplanationQueue = new Queue<MatchExplanationJobData>(MATCH_EXPLANATION_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1_000 },
  },
});

export function matchExplanationJobId(job: MatchExplanationJobData): string {
  const pairKey = `${job.startupContentHash}:${job.mentorContentHash}`;
  return `match-explanation-${createHash("sha256").update(pairKey).digest("hex")}`;
}

export async function enqueueMatchExplanation(
  job: MatchExplanationJobData,
  addJob: (name: string, data: MatchExplanationJobData, options: { jobId: string }) => Promise<unknown> =
    (name, data, options) => matchExplanationQueue.add(name, data, options),
): Promise<void> {
  await addJob("generate-match-explanation", job, { jobId: matchExplanationJobId(job) });
}

export async function closeMatchExplanationQueue(): Promise<void> {
  await matchExplanationQueue.close();
}
