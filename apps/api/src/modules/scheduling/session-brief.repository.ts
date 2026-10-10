import { createHash } from "node:crypto";
import type { SessionBriefDigest } from "../../db/schema/session-briefs";
import { pool } from "../../db/client";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors";

export type SessionBriefInput = { currentStatus: string; specificQuestions: string; desiredOutcome: string };
export type SessionBriefRow = {
  id: string; sessionId: string; founderId: string; currentStatus: string; specificQuestions: string; desiredOutcome: string;
  contentHash: string; digest: SessionBriefDigest | null; digestStatus: "pending" | "ready" | "failed";
  digestModel: string | null; digestGeneratedAt: Date | null; createdAt: Date; updatedAt: Date;
};
export type SessionBriefSaveResult = { brief: SessionBriefRow; changed: boolean };
export type SessionBriefContext = SessionBriefInput & {
  sessionId: string; contentHash: string; startupName: string; stage: string | null; domains: string[];
};

export function hashSessionBrief(input: SessionBriefInput): string {
  return createHash("sha256").update(JSON.stringify([
    input.currentStatus, input.specificQuestions, input.desiredOutcome,
  ])).digest("hex");
}

export async function saveSessionBrief(sessionId: string, founderId: string, input: SessionBriefInput, contentHash: string): Promise<SessionBriefSaveResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sessionResult = await client.query<{ status: string; starts_at: Date; founder_id: string }>(
      "SELECT session.status,lower(session.time_range) AS starts_at,startup.founder_id FROM sessions session JOIN startups startup ON startup.id=session.startup_id WHERE session.id=$1 FOR UPDATE OF session",
      [sessionId],
    );
    const session = sessionResult.rows[0];
    if (!session) throw new NotFoundError("Session not found");
    if (session.founder_id !== founderId) throw new ForbiddenError("Only the founder of this session can submit its brief");
    if (!(session.status === "scheduled" || session.status === "rescheduled") || session.starts_at <= new Date()) {
      throw new ConflictError("The pre-session brief can only be edited before an upcoming scheduled session");
    }
    const current = await client.query<SessionBriefRow>("SELECT id,session_id AS \"sessionId\",founder_id AS \"founderId\",current_status AS \"currentStatus\",specific_questions AS \"specificQuestions\",desired_outcome AS \"desiredOutcome\",content_hash AS \"contentHash\",digest,digest_status AS \"digestStatus\",digest_model AS \"digestModel\",digest_generated_at AS \"digestGeneratedAt\",created_at AS \"createdAt\",updated_at AS \"updatedAt\" FROM session_briefs WHERE session_id=$1 FOR UPDATE", [sessionId]);
    if (current.rows[0]?.contentHash === contentHash) {
      await client.query("COMMIT");
      return { brief: current.rows[0], changed: false };
    }
    const saved = await client.query<SessionBriefRow>(
      `INSERT INTO session_briefs (session_id,founder_id,current_status,specific_questions,desired_outcome,content_hash,digest,digest_status,digest_model,digest_generated_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NULL,'pending',NULL,NULL,now(),now())
       ON CONFLICT (session_id) DO UPDATE SET founder_id=EXCLUDED.founder_id,current_status=EXCLUDED.current_status,specific_questions=EXCLUDED.specific_questions,desired_outcome=EXCLUDED.desired_outcome,content_hash=EXCLUDED.content_hash,digest=NULL,digest_status='pending',digest_model=NULL,digest_generated_at=NULL,updated_at=now()
       RETURNING id,session_id AS "sessionId",founder_id AS "founderId",current_status AS "currentStatus",specific_questions AS "specificQuestions",desired_outcome AS "desiredOutcome",content_hash AS "contentHash",digest,digest_status AS "digestStatus",digest_model AS "digestModel",digest_generated_at AS "digestGeneratedAt",created_at AS "createdAt",updated_at AS "updatedAt"`,
      [sessionId, founderId, input.currentStatus, input.specificQuestions, input.desiredOutcome, contentHash],
    );
    await client.query("COMMIT");
    return { brief: saved.rows[0]!, changed: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function readSessionBrief(sessionId: string, actorId: string): Promise<{ brief: SessionBriefRow | null } | null> {
  const result = await pool.query<SessionBriefRow>(
    `SELECT brief.id,brief.session_id AS "sessionId",brief.founder_id AS "founderId",brief.current_status AS "currentStatus",brief.specific_questions AS "specificQuestions",brief.desired_outcome AS "desiredOutcome",brief.content_hash AS "contentHash",brief.digest,brief.digest_status AS "digestStatus",brief.digest_model AS "digestModel",brief.digest_generated_at AS "digestGeneratedAt",brief.created_at AS "createdAt",brief.updated_at AS "updatedAt"
     FROM sessions session JOIN startups startup ON startup.id=session.startup_id
     LEFT JOIN session_briefs brief ON brief.session_id=session.id
     WHERE session.id=$1 AND (startup.founder_id=$2 OR session.mentor_id=$2)`,
    [sessionId, actorId],
  );
  if (!result.rowCount) return null;
  return { brief: result.rows[0]!.id ? result.rows[0]! : null };
}

export async function loadSessionBriefContext(sessionId: string): Promise<SessionBriefContext | null> {
  const result = await pool.query<SessionBriefContext>(
    `SELECT brief.session_id AS "sessionId",brief.current_status AS "currentStatus",brief.specific_questions AS "specificQuestions",brief.desired_outcome AS "desiredOutcome",brief.content_hash AS "contentHash",startup.name AS "startupName",stage.name AS stage,COALESCE(array_agg(domain.name ORDER BY startup_domain.display_order) FILTER (WHERE domain.id IS NOT NULL),'{}') AS domains
     FROM session_briefs brief JOIN sessions session ON session.id=brief.session_id
     JOIN startups startup ON startup.id=session.startup_id
     LEFT JOIN stages stage ON stage.id=startup.stage_id
     LEFT JOIN startup_domains startup_domain ON startup_domain.startup_id=startup.id
     LEFT JOIN domains domain ON domain.id=startup_domain.domain_id
     WHERE brief.session_id=$1 GROUP BY brief.session_id,brief.current_status,brief.specific_questions,brief.desired_outcome,brief.content_hash,startup.name,stage.name`,
    [sessionId],
  );
  return result.rows[0] ?? null;
}

export async function saveSessionBriefDigest(sessionId: string, contentHash: string, digest: SessionBriefDigest, model: string): Promise<boolean> {
  const result = await pool.query(
    "UPDATE session_briefs SET digest=$3,digest_status='ready',digest_model=$4,digest_generated_at=now(),updated_at=now() WHERE session_id=$1 AND content_hash=$2",
    [sessionId, contentHash, JSON.stringify(digest), model],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markSessionBriefFailed(sessionId: string, contentHash: string): Promise<boolean> {
  const result = await pool.query(
    "UPDATE session_briefs SET digest=NULL,digest_status='failed',digest_model=NULL,digest_generated_at=NULL,updated_at=now() WHERE session_id=$1 AND content_hash=$2",
    [sessionId, contentHash],
  );
  return (result.rowCount ?? 0) > 0;
}
