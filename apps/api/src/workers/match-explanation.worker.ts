import { Worker } from "bullmq";
import { pool } from "../db/client";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { redis } from "../lib/redis";
import { closeMatchExplanationQueue, MATCH_EXPLANATION_QUEUE_NAME } from "../modules/matching/explanations/explanation.queue";
import { isMatchExplanationVersionCurrent, upsertMatchExplanation } from "../modules/matching/explanations/explanation.repository";
import { processMatchExplanation, saveFinalAttemptFallback } from "../modules/matching/explanations/explanation.processor";
import type { MatchExplanationJobData } from "../modules/matching/explanations/explanation.types";

const worker = new Worker<MatchExplanationJobData>(MATCH_EXPLANATION_QUEUE_NAME, (job) => processMatchExplanation(job.data), {
  connection: redis.duplicate({ maxRetriesPerRequest: null }),
  concurrency: 2,
});

worker.on("completed", (job, result) => {
  logger.info({ jobId: job.id, status: result.status }, "Match explanation job completed");
});

worker.on("failed", (job, error) => {
  if (!job) return;
  const maxAttempts = Number(job.opts.attempts ?? 1);
  if (job.attemptsMade >= maxAttempts) {
    void saveFinalAttemptFallback(job.data, upsertMatchExplanation, isMatchExplanationVersionCurrent)
      .then((saved) => logger.warn({ jobId: job.id, saved, error: error.name }, "Groq explanation retries exhausted; using template"))
      .catch((fallbackError: unknown) => logger.error({ jobId: job.id, error: fallbackError instanceof Error ? fallbackError.name : "unknown" }, "Could not persist match explanation fallback"));
    return;
  }
  logger.warn({ jobId: job.id, attempt: job.attemptsMade, error: error.name }, "Match explanation generation attempt failed");
});

let lastWorkerErrorAt = 0;
worker.on("error", (error) => {
  const now = Date.now();
  if (now - lastWorkerErrorAt < 10_000) return;
  lastWorkerErrorAt = now;
  logger.error({ error: error.name, code: (error as NodeJS.ErrnoException).code }, "Match explanation worker connection error");
});

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  logger.info({ signal }, "Match explanation worker shutting down");
  await worker.close(true).catch((error: unknown) => logger.error({ error: error instanceof Error ? error.name : "unknown" }, "Match explanation worker close failed"));
  await closeMatchExplanationQueue().catch((error: unknown) => logger.error({ error: error instanceof Error ? error.name : "unknown" }, "Match explanation queue close failed"));
  await Promise.allSettled([redis.quit(), pool.end()]);
}

const startupTimer = setTimeout(() => {
  logger.fatal("Timed out connecting to Redis for the match explanation worker");
  void shutdown("startup timeout").finally(() => { process.exitCode = 1; });
}, 15_000);
void worker.waitUntilReady().then(() => {
  clearTimeout(startupTimer);
  logger.info({ groqEnabled: !!env.GROQ_API_KEY, model: env.GROQ_EXPLAIN_MODEL }, "Match explanation worker is ready");
}).catch((error: unknown) => {
  clearTimeout(startupTimer);
  logger.fatal({ error: error instanceof Error ? error.message : "unknown" }, "Match explanation worker failed to initialize");
  void shutdown("initialization failure").finally(() => { process.exitCode = 1; });
});

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
