import { Worker } from "bullmq";
import { pool } from "../db/client";
import { logger } from "../config/logger";
import { redis } from "../lib/redis";
import { embeddingQueue, EMBEDDING_QUEUE_NAME, type EmbeddingJobData } from "../modules/embeddings/embedding.queue";
import { processEmbeddingJob } from "../modules/embeddings/embedding.processor";
import { warmUpEmbeddingModel } from "../modules/embeddings/embedding.service";

let worker: Worker<EmbeddingJobData> | undefined;
let closing = false;
let lastWorkerErrorAt = 0;

async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  logger.info({ signal }, "Embedding worker shutting down");
  await worker?.close(true).catch((error: unknown) => logger.error({ error: error instanceof Error ? error.name : "unknown" }, "Embedding worker close failed"));
  await embeddingQueue.close().catch((error: unknown) => logger.error({ error }, "Embedding queue close failed"));
  await Promise.allSettled([redis.quit(), pool.end()]);
}

async function main() {
  try {
    logger.info("Loading and warming the profile embedding model");
    await warmUpEmbeddingModel();
    worker = new Worker<EmbeddingJobData>(EMBEDDING_QUEUE_NAME, (job) => processEmbeddingJob(job.data), {
      connection: redis.duplicate({ maxRetriesPerRequest: null }),
      concurrency: 2,
      limiter: { max: 20, duration: 1_000 },
    });
    worker.on("completed", (job, result) => {
      logger.info({ jobId: job.id, profileType: job.data.profileType, status: result.status }, "Profile embedding job completed");
    });
    worker.on("failed", (job, error) => {
      logger.error({ jobId: job?.id, error: error.name }, "Profile embedding job failed");
    });
    worker.on("error", (error) => {
      const now = Date.now();
      if (now - lastWorkerErrorAt < 10_000) return;
      lastWorkerErrorAt = now;
      logger.error({ error: error.name, code: (error as NodeJS.ErrnoException).code }, "Embedding worker connection error");
    });
    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        worker.waitUntilReady(),
        new Promise<never>((_, reject) => {
          startupTimer = setTimeout(() => reject(new Error("Timed out connecting to Redis for the embedding worker")), 15_000);
        }),
      ]);
    } finally {
      if (startupTimer) clearTimeout(startupTimer);
    }
    logger.info("Profile embedding worker is ready");
  } catch (error) {
    logger.fatal({ error: error instanceof Error ? error.message : "unknown initialization failure" }, "Embedding worker failed to initialize");
    await shutdown("initialization failure");
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
void main();
