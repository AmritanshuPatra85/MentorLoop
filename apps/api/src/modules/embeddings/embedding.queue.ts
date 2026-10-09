import { Queue } from "bullmq";
import { redis } from "../../lib/redis";
import { AppError } from "../../lib/errors";

export const EMBEDDING_QUEUE_NAME = "profile-embeddings";
export const EMBEDDING_DEBOUNCE_MS = 1_500;

export type EmbeddingJobData = {
  profileType: "startup" | "mentor";
  profileId: string;
};

export const embeddingQueue = new Queue<EmbeddingJobData>(EMBEDDING_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 2_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1_000 },
  },
});

export function embeddingJobOptions(data: EmbeddingJobData) {
  return {
    delay: EMBEDDING_DEBOUNCE_MS,
    deduplication: {
      id: `${data.profileType}:${data.profileId}`,
      extend: true,
      replace: true,
      keepLastIfActive: true,
    },
  } as const;
}

export async function enqueueProfileEmbedding(
  data: EmbeddingJobData,
  addJob: (jobData: EmbeddingJobData, options: ReturnType<typeof embeddingJobOptions>) => Promise<unknown> =
    (jobData, options) => embeddingQueue.add("refresh-profile-embedding", jobData, options),
): Promise<void> {
  try {
    await addJob(data, embeddingJobOptions(data));
  } catch {
    throw new AppError(
      503,
      "EMBEDDING_QUEUE_UNAVAILABLE",
      "Profile was saved, but its embedding refresh could not be queued. Please retry the profile update.",
    );
  }
}

export async function closeEmbeddingQueue(): Promise<void> {
  await embeddingQueue.close();
}
