import { AppError } from "../../lib/errors";
import type { SessionBriefDigest } from "../../db/schema/session-briefs";
import type { SessionBriefJob } from "./session-brief.queue";

export type SessionBriefProcessorDependencies = {
  hasApiKey: boolean;
  loadCurrent: (sessionId: string) => Promise<{ contentHash: string } | null>;
  generate: ((job: SessionBriefJob) => Promise<SessionBriefDigest>) | null;
  saveReady: (job: SessionBriefJob, digest: SessionBriefDigest, model: string) => Promise<boolean>;
  markFailed: (job: SessionBriefJob) => Promise<boolean>;
  model: string;
};

export function createSessionBriefProcessor(dependencies: SessionBriefProcessorDependencies) {
  return async (job: SessionBriefJob) => {
    const current = await dependencies.loadCurrent(job.sessionId);
    if (!current || current.contentHash !== job.contentHash) return { status: "stale" as const };
    if (!dependencies.hasApiKey || !dependencies.generate) {
      await dependencies.markFailed(job);
      return { status: "failed" as const };
    }
    let digest: SessionBriefDigest;
    try { digest = await dependencies.generate(job); }
    catch (error) {
      if (error instanceof AppError && error.code === "GROQ_INVALID_DIGEST") {
        await dependencies.markFailed(job);
        return { status: "failed" as const };
      }
      throw error;
    }
    // The repository update also includes the hash in its WHERE clause, guarding edits
    // that happen during the network request.
    const saved = await dependencies.saveReady(job, digest, dependencies.model);
    return { status: saved ? "ready" as const : "stale" as const };
  };
}

export async function markFinalSessionBriefAttemptFailed(
  job: SessionBriefJob,
  markFailed: SessionBriefProcessorDependencies["markFailed"],
): Promise<boolean> {
  return markFailed(job);
}
