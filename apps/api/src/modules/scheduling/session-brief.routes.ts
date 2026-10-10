import { Router } from "express";
import { sessionBriefInputSchema, sessionBriefResponseSchema } from "@mentorloop/shared";
import type { SessionBriefRow } from "./session-brief.repository";
import { ForbiddenError, NotFoundError } from "../../lib/errors";
import { asyncHandler } from "../../lib/async-handler";
import { validate } from "../../middleware/validate";
import { logger } from "../../config/logger";
import {
  hashSessionBrief, loadSessionBriefContext, markSessionBriefFailed, readSessionBrief,
  saveSessionBrief, type SessionBriefContext, type SessionBriefInput, type SessionBriefSaveResult,
} from "./session-brief.repository";
import { enqueueSessionBriefDigest } from "./session-brief.queue";

type SessionBriefRouteDependencies = {
  save: (sessionId: string, founderId: string, input: SessionBriefInput, contentHash: string) => Promise<SessionBriefSaveResult>;
  read: (sessionId: string, actorId: string) => Promise<{ brief: SessionBriefRow | null } | null>;
  loadContext: (sessionId: string) => Promise<SessionBriefContext | null>;
  enqueue: (job: SessionBriefContext) => Promise<void>;
  markFailed: (sessionId: string, contentHash: string) => Promise<boolean>;
  hash: (input: SessionBriefInput) => string;
  reportQueueFailure: (jobId: string, error: unknown) => void;
};

const productionDependencies: SessionBriefRouteDependencies = {
  save: saveSessionBrief,
  read: readSessionBrief,
  loadContext: loadSessionBriefContext,
  enqueue: enqueueSessionBriefDigest,
  markFailed: markSessionBriefFailed,
  hash: hashSessionBrief,
  reportQueueFailure: (jobId, error) => logger.warn({ jobId, error: error instanceof Error ? error.name : "unknown" }, "Session brief digest could not be enqueued"),
};

function toBriefResponse(row: SessionBriefRow | null) {
  if (!row) return { brief: null };
  return sessionBriefResponseSchema.parse({ brief: {
    ...row,
    createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString(),
    digestGeneratedAt: row.digestGeneratedAt ? new Date(row.digestGeneratedAt).toISOString() : null,
  } });
}

/** mergeParams lets the parent /sessions/:sessionId route retain its existing auth guards. */
export function createSessionBriefRouter(dependencies: SessionBriefRouteDependencies = productionDependencies) {
  const router = Router({ mergeParams: true });
  router.put("/", validate({ body: sessionBriefInputSchema }), asyncHandler(async (req, res) => {
    if (req.auth!.role !== "founder") throw new ForbiddenError("Only founders can edit a pre-session brief");
    const sessionId = req.params.sessionId!;
    const input = sessionBriefInputSchema.parse(req.body);
    const contentHash = dependencies.hash(input);
    const { brief, changed } = await dependencies.save(sessionId, req.auth!.userId, input, contentHash);
    if (changed) {
      const job = await dependencies.loadContext(sessionId);
      if (!job || job.contentHash !== contentHash) {
        // A newer edit can race the context read; it owns the current job state.
        if (!job) await dependencies.markFailed(sessionId, contentHash);
      } else {
        try { await dependencies.enqueue(job); }
        catch (error) {
          await dependencies.markFailed(sessionId, contentHash).catch(() => false);
          dependencies.reportQueueFailure(`session-brief-${sessionId}-${contentHash}`, error);
          brief.digestStatus = "failed";
          brief.digest = null;
        }
      }
    }
    res.json(toBriefResponse(brief));
  }));

  router.get("/", asyncHandler(async (req, res) => {
    const result = await dependencies.read(req.params.sessionId!, req.auth!.userId);
    if (!result) throw new NotFoundError("Session not found");
    res.json(toBriefResponse(result.brief));
  }));
  return router;
}

export const sessionBriefRouter = createSessionBriefRouter();
