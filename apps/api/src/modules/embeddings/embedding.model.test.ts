import assert from "node:assert/strict";
import { test } from "node:test";
import { embeddingService } from "./embedding.service";

test("all-MiniLM ranks semantically related profile text above unrelated text", { skip: process.env.RUN_MODEL_INTEGRATION !== "1" }, async () => {
  const startup = await embeddingService.generate("Early stage fintech startup needs help with customer discovery and product-market fit.");
  const related = await embeddingService.generate("Seed stage financial technology company seeking customer research and product strategy mentorship.");
  const unrelated = await embeddingService.generate("A mentor teaches classical guitar performance and orchestral music theory.");
  const cosine = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + value * b[index]!, 0);
  assert.ok(cosine(startup, related) > cosine(startup, unrelated));
});
