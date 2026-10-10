import { Worker } from "bullmq";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { pool } from "../db/client";
import { redis } from "../lib/redis";
import { closeSessionBriefQueue, SESSION_BRIEF_QUEUE_NAME, type SessionBriefJob } from "../modules/scheduling/session-brief.queue";
import { loadSessionBriefContext, markSessionBriefFailed, saveSessionBriefDigest } from "../modules/scheduling/session-brief.repository";
import { createSessionBriefProcessor, markFinalSessionBriefAttemptFailed } from "../modules/scheduling/session-brief.processor";
import { generateSessionBriefDigest } from "../modules/scheduling/session-brief.groq";

const digestGenerator = generateSessionBriefDigest;
const processJob = createSessionBriefProcessor({
  hasApiKey: Boolean(env.GROQ_API_KEY),
  loadCurrent: async (sessionId) => {
    const current = await loadSessionBriefContext(sessionId);
    return current ? { contentHash: current.contentHash } : null;
  },
  generate: digestGenerator ? (job) => digestGenerator(job) : null,
  saveReady: (job, digest, model) => saveSessionBriefDigest(job.sessionId, job.contentHash, digest, model),
  markFailed: (job) => markSessionBriefFailed(job.sessionId, job.contentHash),
  model: env.GROQ_QUALITY_MODEL,
});

const worker = new Worker<SessionBriefJob>(SESSION_BRIEF_QUEUE_NAME, (job) => processJob(job.data), {
  connection: redis.duplicate({ maxRetriesPerRequest: null }), concurrency: 3,
});

worker.on("completed", (job, result) => logger.info({ jobId: job.id, status: result.status }, "Session brief digest job completed"));
worker.on("failed", (job, error) => {
  if (!job) return;
  const maxAttempts = Number(job.opts.attempts ?? 1);
  if (job.attemptsMade >= maxAttempts) {
    void markFinalSessionBriefAttemptFailed(job.data, (data) => markSessionBriefFailed(data.sessionId, data.contentHash))
      .then((saved) => logger.warn({ jobId: job.id, saved, error: error.name }, "Session brief digest retries exhausted"))
      .catch((failure: unknown) => logger.error({ jobId: job.id, error: failure instanceof Error ? failure.name : "unknown" }, "Could not mark session brief digest failed"));
    return;
  }
  logger.warn({ jobId: job.id, attempt: job.attemptsMade, error: error.name }, "Session brief digest attempt failed");
});

let lastWorkerErrorAt = 0;
worker.on("error", (error) => {
  if (Date.now() - lastWorkerErrorAt < 10_000) return;
  lastWorkerErrorAt = Date.now();
  logger.error({ error: error.name, code: (error as NodeJS.ErrnoException).code }, "Session brief worker connection error");
});

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  logger.info({ signal }, "Session brief worker shutting down");
  await worker.close(true).catch((error: unknown) => logger.error({ error: error instanceof Error ? error.name : "unknown" }, "Session brief worker close failed"));
  await closeSessionBriefQueue().catch((error: unknown) => logger.error({ error: error instanceof Error ? error.name : "unknown" }, "Session brief queue close failed"));
  await Promise.allSettled([redis.quit(), pool.end()]);
}

const startupTimer = setTimeout(() => {
  logger.fatal("Timed out connecting to Redis for the session brief worker");
  void shutdown("startup timeout").finally(() => { process.exitCode = 1; });
}, 15_000);
void worker.waitUntilReady().then(() => {
  clearTimeout(startupTimer);
  logger.info({ groqEnabled: Boolean(env.GROQ_API_KEY), model: env.GROQ_QUALITY_MODEL }, "Session brief worker is ready");
}).catch((error: unknown) => {
  clearTimeout(startupTimer);
  logger.fatal({ error: error instanceof Error ? error.name : "unknown" }, "Session brief worker failed to initialize");
  void shutdown("initialization failure").finally(() => { process.exitCode = 1; });
});

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
