export const EMBEDDING_MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMENSIONS = 384;

export type EmbeddingTensor = { dims: number[]; data: ArrayLike<number> };
export type FeatureExtractor = (text: string, options: { pooling: "mean"; normalize: true }) => Promise<EmbeddingTensor>;
export type ModelLoader = () => Promise<FeatureExtractor>;

export class EmbeddingError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EmbeddingError";
  }
}

export function normalizeEmbeddingInput(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

async function loadDefaultExtractor(): Promise<FeatureExtractor> {
  try {
    const { pipeline } = await import("@xenova/transformers");
    return await pipeline("feature-extraction", EMBEDDING_MODEL_ID) as unknown as FeatureExtractor;
  } catch (cause) {
    throw new EmbeddingError(`Could not initialize ${EMBEDDING_MODEL_ID}. Check model download access and cache permissions.`, { cause });
  }
}

export class EmbeddingService {
  private extractorPromise?: Promise<FeatureExtractor>;

  constructor(private readonly loadExtractor: ModelLoader = loadDefaultExtractor) {}

  private getExtractor(): Promise<FeatureExtractor> {
    if (!this.extractorPromise) {
      this.extractorPromise = this.loadExtractor().catch((cause: unknown) => {
        this.extractorPromise = undefined;
        if (cause instanceof EmbeddingError) throw cause;
        throw new EmbeddingError(`Could not initialize ${EMBEDDING_MODEL_ID}.`, { cause });
      });
    }
    return this.extractorPromise;
  }

  async generate(text: string): Promise<number[]> {
    const input = normalizeEmbeddingInput(text);
    if (!input) throw new EmbeddingError("Cannot embed an empty profile description.");
    let output: EmbeddingTensor;
    try {
      output = await (await this.getExtractor())(input, { pooling: "mean", normalize: true });
    } catch (cause) {
      if (cause instanceof EmbeddingError) throw cause;
      throw new EmbeddingError("Embedding inference failed.", { cause });
    }
    if (output.dims.length !== 2 || output.dims[0] !== 1 || output.dims[1] !== EMBEDDING_DIMENSIONS || output.data.length !== EMBEDDING_DIMENSIONS) {
      throw new EmbeddingError(`Model returned an invalid shape; expected [1, ${EMBEDDING_DIMENSIONS}].`);
    }
    const values = Array.from(output.data);
    if (!values.every(Number.isFinite)) throw new EmbeddingError("Model returned non-finite embedding values.");
    const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
    if (!Number.isFinite(norm) || norm === 0) throw new EmbeddingError("Model returned a zero or invalid embedding vector.");
    return values.map((value) => value / norm);
  }

  async warmUp(): Promise<void> {
    await this.generate("MentorLoop profile embedding warmup.");
  }
}

// One service instance per process shares a single lazy model initialization promise.
export const embeddingService = new EmbeddingService();
export const generateEmbedding = (text: string) => embeddingService.generate(text);
export const warmUpEmbeddingModel = () => embeddingService.warmUp();
