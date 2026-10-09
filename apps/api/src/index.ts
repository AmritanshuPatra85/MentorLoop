import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { pool } from "./db/client";
import { redis } from "./lib/redis";
import { closeEmbeddingQueue } from "./modules/embeddings/embedding.queue";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);
  server.close();
  await closeEmbeddingQueue().catch((error: unknown) => logger.error({ error }, "Embedding queue shutdown failed"));
  await Promise.allSettled([pool.end(), redis.quit()]);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
