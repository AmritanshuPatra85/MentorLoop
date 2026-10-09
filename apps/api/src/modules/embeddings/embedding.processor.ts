import { embeddingService } from "./embedding.service";
import { deleteEmbeddingIfCurrent, getStoredEmbedding, hashEmbeddingText, loadEmbeddingProfile, storeEmbeddingIfCurrent } from "./embedding.repository";
import type { EmbeddingJobData } from "./embedding.queue";

export type EmbeddingProcessorDependencies = {
  load: typeof loadEmbeddingProfile;
  getStored: typeof getStoredEmbedding;
  store: typeof storeEmbeddingIfCurrent;
  remove: typeof deleteEmbeddingIfCurrent;
  generate: (text: string) => Promise<number[]>;
};

const defaultDependencies: EmbeddingProcessorDependencies = {
  load: loadEmbeddingProfile,
  getStored: getStoredEmbedding,
  store: storeEmbeddingIfCurrent,
  remove: deleteEmbeddingIfCurrent,
  generate: (text) => embeddingService.generate(text),
};

export function createEmbeddingProcessor(dependencies: EmbeddingProcessorDependencies = defaultDependencies) {
  return async function processEmbedding(data: EmbeddingJobData) {
    const profile = await dependencies.load(data);
    if (!profile) return { status: "missing" as const };
    if (!profile.text) {
      const removed = await dependencies.remove(data, profile.version);
      return { status: removed ? "empty" as const : "stale" as const };
    }

    const contentHash = hashEmbeddingText(profile.text);
    const stored = await dependencies.getStored(data);
    if (stored?.contentHash === contentHash && stored.embedding.length === 384 && stored.embedding.every(Number.isFinite)) {
      return { status: "unchanged" as const };
    }

    const embedding = await dependencies.generate(profile.text);
    const storedCurrent = await dependencies.store(data, profile.version, contentHash, embedding);
    return { status: storedCurrent ? "updated" as const : "stale" as const };
  };
}

export const processEmbeddingJob = createEmbeddingProcessor();
