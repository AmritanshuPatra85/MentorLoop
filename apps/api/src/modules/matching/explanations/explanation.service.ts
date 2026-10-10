import { logger } from "../../../config/logger";
import { enqueueMatchExplanation } from "./explanation.queue";
import { loadMatchExplanationInputs, readMatchExplanationCache, seedMatchExplanationTemplate } from "./explanation.repository";
import { createMatchExplanationService } from "./explanation.attach";

export const explainRankedMentors = createMatchExplanationService({
  loadInputs: loadMatchExplanationInputs,
  readCache: readMatchExplanationCache,
  enqueue: enqueueMatchExplanation,
  seedTemplate: seedMatchExplanationTemplate,
  queueError: (error, jobId) => logger.warn({ jobId, error: error instanceof Error ? error.name : "unknown" }, "Match explanation job could not be enqueued"),
});
