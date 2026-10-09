import { pool } from "../db/client";
import { redis } from "../lib/redis";
import { closeEmbeddingQueue, enqueueProfileEmbedding } from "../modules/embeddings/embedding.queue";
import { getEmbeddingProfileIds, hashEmbeddingText, isStoredEmbeddingCurrent, loadEmbeddingProfile } from "../modules/embeddings/embedding.repository";
import { runEmbeddingBackfill } from "../modules/embeddings/embedding.backfill";

const BATCH_SIZE = 100;
const dryRun = process.argv.includes("--dry-run");

async function main() {
  try {
    const counts = await runEmbeddingBackfill({
      listIds: getEmbeddingProfileIds,
      isCurrent: async (data) => {
        const profile = await loadEmbeddingProfile(data);
        if (!profile) return true;
        return profile.text ? isStoredEmbeddingCurrent(data, hashEmbeddingText(profile.text)) : false;
      },
      enqueue: enqueueProfileEmbedding,
    }, dryRun, BATCH_SIZE);
    console.log(JSON.stringify({ mode: dryRun ? "dry-run" : "enqueue", ...counts }, null, 2));
    if (counts.failures) process.exitCode = 1;
  } finally {
    await closeEmbeddingQueue().catch(() => undefined);
    await Promise.allSettled([pool.end(), redis.quit()]);
  }
}

void main().catch((error: unknown) => {
  console.error("Embedding backfill failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
