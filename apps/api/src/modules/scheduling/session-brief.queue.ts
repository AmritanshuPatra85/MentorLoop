import { Queue } from "bullmq";
import { createHash } from "node:crypto";
import { redis } from "../../lib/redis";
import type { SessionBriefContext } from "./session-brief.repository";

export const SESSION_BRIEF_QUEUE_NAME = "session-brief-digests";
export type SessionBriefJob = SessionBriefContext;
let queue: Queue<SessionBriefJob> | undefined;

export function getSessionBriefQueue(): Queue<SessionBriefJob> {
  queue ??= new Queue<SessionBriefJob>(SESSION_BRIEF_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1500 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  });
  return queue;
}

export function sessionBriefJobId(sessionId: string, contentHash: string): string {
  const stableHash = createHash("sha256").update(`${sessionId}:${contentHash}`).digest("hex");
  return `session-brief-${stableHash}`;
}

export async function enqueueSessionBriefDigest(job: SessionBriefJob): Promise<void> {
  await getSessionBriefQueue().add("generate-session-brief-digest", job, { jobId: sessionBriefJobId(job.sessionId, job.contentHash) });
}

export async function closeSessionBriefQueue(): Promise<void> {
  const current = queue;
  queue = undefined;
  await current?.close();
}
