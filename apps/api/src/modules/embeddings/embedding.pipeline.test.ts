import assert from "node:assert/strict";
import { after, test } from "node:test";
import { embeddingJobOptions, enqueueProfileEmbedding, closeEmbeddingQueue, type EmbeddingJobData } from "./embedding.queue";
import { createEmbeddingProcessor } from "./embedding.processor";
import { hashEmbeddingText } from "./embedding.repository";
import { runEmbeddingBackfill } from "./embedding.backfill";
import { redis } from "../../lib/redis";

const vector = Array(384).fill(0.25);
const startup: EmbeddingJobData = { profileType: "startup", profileId: "startup-id" };

after(async () => {
  await closeEmbeddingQueue();
  redis.disconnect();
});

test("unchanged profile hash skips inference and repeated jobs remain idempotent", async () => {
  let storedHash: string | null = null;
  let inferenceCount = 0;
  let writes = 0;
  const processor = createEmbeddingProcessor({
    load: async () => ({ text: "Startup: A", version: "version-1" }),
    getStored: async () => storedHash ? { contentHash: storedHash, embedding: vector } : null,
    store: async (_data, _version, hash) => { storedHash = hash; writes++; return true; },
    remove: async () => true,
    generate: async () => { inferenceCount++; return vector; },
  });
  assert.deepEqual(await processor(startup), { status: "updated" });
  assert.deepEqual(await processor(startup), { status: "unchanged" });
  assert.equal(storedHash, hashEmbeddingText("Startup: A"));
  assert.equal(inferenceCount, 1);
  assert.equal(writes, 1);
});

test("changed content regenerates, and stale versions cannot be persisted", async () => {
  let inferenceCount = 0;
  let savedHash = "old-hash";
  const processor = createEmbeddingProcessor({
    load: async () => ({ text: "Startup: New content", version: "version-2" }),
    getStored: async () => ({ contentHash: savedHash, embedding: vector }),
    store: async (_data, version, hash) => {
      assert.equal(version, "version-2");
      savedHash = hash;
      return false;
    },
    remove: async () => true,
    generate: async () => { inferenceCount++; return vector; },
  });
  assert.deepEqual(await processor(startup), { status: "stale" });
  assert.equal(inferenceCount, 1);
  assert.equal(savedHash, hashEmbeddingText("Startup: New content"));
});

test("missing and empty profiles are handled without inference", async () => {
  let removed = 0;
  let inferenceCount = 0;
  const missing = createEmbeddingProcessor({
    load: async () => null,
    getStored: async () => null,
    store: async () => true,
    remove: async () => { removed++; return true; },
    generate: async () => { inferenceCount++; return vector; },
  });
  assert.deepEqual(await missing(startup), { status: "missing" });
  const empty = createEmbeddingProcessor({
    load: async () => ({ text: "", version: "version-1" }),
    getStored: async () => null,
    store: async () => true,
    remove: async (_data, version) => { assert.equal(version, "version-1"); removed++; return true; },
    generate: async () => { inferenceCount++; return vector; },
  });
  assert.deepEqual(await empty(startup), { status: "empty" });
  assert.equal(removed, 1);
  assert.equal(inferenceCount, 0);
});

test("inference failures propagate so BullMQ can retry the job", async () => {
  const processor = createEmbeddingProcessor({
    load: async () => ({ text: "Startup: A", version: "version-1" }),
    getStored: async () => null,
    store: async () => true,
    remove: async () => true,
    generate: async () => { throw new Error("model unavailable"); },
  });
  await assert.rejects(processor(startup), /model unavailable/);
});

test("content hashing uses the same whitespace normalization as model input", async () => {
  assert.equal(hashEmbeddingText("Startup:\n  A   pitch"), hashEmbeddingText("Startup: A pitch"));
});

test("queue options debounce by profile and queue errors are explicit", async () => {
  const options = embeddingJobOptions(startup);
  assert.equal(options.delay, 1_500);
  assert.deepEqual(options.deduplication, {
    id: "startup:startup-id", extend: true, replace: true, keepLastIfActive: true,
  });
  let attempts = 0;
  await enqueueProfileEmbedding(startup, async (data, jobOptions) => {
    attempts++;
    assert.deepEqual(data, startup);
    assert.equal(jobOptions.delay, 1_500);
  });
  assert.equal(attempts, 1);
  await assert.rejects(
    enqueueProfileEmbedding(startup, async () => { throw new Error("redis unavailable"); }),
    (error: unknown) => typeof error === "object" && error !== null && "status" in error && error.status === 503,
  );
});

test("backfill paginates, skips current profiles and supports a dry run", async () => {
  const ids = { startup: ["s1", "s2", "s3"], mentor: ["m1", "m2"] };
  const enqueued: string[] = [];
  const counts = await runEmbeddingBackfill({
    listIds: async (type, after, limit) => ids[type].filter((id) => !after || id > after).slice(0, limit),
    isCurrent: async ({ profileId }) => profileId === "s2" || profileId === "m1",
    enqueue: async ({ profileId }) => { enqueued.push(profileId); },
  }, true, 2);
  assert.deepEqual(counts, { profilesScanned: 5, jobsEnqueued: 0, eligible: 3, currentSkipped: 2, failures: 0 });
  assert.deepEqual(enqueued, []);
});
