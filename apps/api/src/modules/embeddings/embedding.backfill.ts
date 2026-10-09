import type { EmbeddingJobData } from "./embedding.queue";

export type EmbeddingBackfillDependencies = {
  listIds: (type: EmbeddingJobData["profileType"], after: string | null, limit: number) => Promise<string[]>;
  isCurrent: (data: EmbeddingJobData) => Promise<boolean>;
  enqueue: (data: EmbeddingJobData) => Promise<void>;
};

export async function runEmbeddingBackfill(
  dependencies: EmbeddingBackfillDependencies,
  dryRun = false,
  batchSize = 100,
) {
  const result = { profilesScanned: 0, jobsEnqueued: 0, eligible: 0, currentSkipped: 0, failures: 0 };
  for (const profileType of ["startup", "mentor"] as const) {
    let after: string | null = null;
    while (true) {
      const ids = await dependencies.listIds(profileType, after, batchSize);
      if (!ids.length) break;
      for (const profileId of ids) {
        after = profileId;
        result.profilesScanned++;
        const data = { profileType, profileId };
        try {
          if (await dependencies.isCurrent(data)) {
            result.currentSkipped++;
            continue;
          }
          result.eligible++;
          if (!dryRun) {
            await dependencies.enqueue(data);
            result.jobsEnqueued++;
          }
        } catch {
          result.failures++;
        }
      }
      if (ids.length < batchSize) break;
    }
  }
  return result;
}
