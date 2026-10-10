import type { SessionActionItem, SessionActionItemProposal } from "@mentorloop/shared";
import { pool } from "../../db/client";
import { ConflictError, NotFoundError } from "../../lib/errors";

export type SessionActionItemsContext = {
  sessionId: string;
  sessionDate: string;
  timezone: string;
  founderName: string;
  mentorName: string;
};
export type ReviewedSessionActionItem = Omit<SessionActionItemProposal, "sourceText">;

type DatabaseActionItem = Omit<SessionActionItem, "createdAt" | "updatedAt"> & { createdAt: Date; updatedAt: string; overdue: boolean };
const ACTION_ITEM_SELECT = `item.id,item.session_id AS "sessionId",item.created_by AS "createdBy",item.submission_id AS "submissionId",item.title,item.description,item.owner,item.due_date::text AS "dueDate",item.priority,item.status,(item.due_date < CURRENT_DATE AND item.status <> 'done') AS overdue,item.created_at AS "createdAt",to_char(item.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "updatedAt"`;
const ACTION_ITEM_RETURNING = `id,session_id AS "sessionId",created_by AS "createdBy",submission_id AS "submissionId",title,description,owner,due_date::text AS "dueDate",priority,status,(due_date < CURRENT_DATE AND status <> 'done') AS overdue,created_at AS "createdAt",to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "updatedAt"`;
export type ActionItemFilters = { status?: string; owner?: string; overdue?: "true" | "false" };

function sessionLocalDate(startsAt: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(startsAt);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function getSessionActionItemsContext(sessionId: string, actorId: string): Promise<SessionActionItemsContext> {
  const result = await pool.query<{
    id: string; starts_at: Date; timezone: string | null; founder_name: string; mentor_name: string;
  }>(
    `SELECT session.id,lower(session.time_range) AS starts_at,mentor_profile.timezone,
            founder.full_name AS founder_name,mentor.full_name AS mentor_name
     FROM sessions session
     JOIN startups startup ON startup.id=session.startup_id
     JOIN users founder ON founder.id=startup.founder_id
     JOIN users mentor ON mentor.id=session.mentor_id
     LEFT JOIN mentor_profiles mentor_profile ON mentor_profile.user_id=session.mentor_id
     WHERE session.id=$1 AND (founder.id=$2 OR mentor.id=$2)`,
    [sessionId, actorId],
  );
  const session = result.rows[0];
  if (!session) throw new NotFoundError("Session not found");
  const timezone = session.timezone || "UTC";
  return {
    sessionId: session.id,
    sessionDate: sessionLocalDate(session.starts_at, timezone),
    timezone,
    founderName: session.founder_name,
    mentorName: session.mentor_name,
  };
}

function normalizeRows(rows: DatabaseActionItem[]): SessionActionItem[] {
  return rows.map((row) => ({
    ...row,
    dueDate: row.dueDate ? String(row.dueDate).slice(0, 10) : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: row.updatedAt,
  }));
}

function filterSql(filters: ActionItemFilters, firstParameter: number): { where: string; values: string[] } {
  const clauses: string[] = [];
  const values: string[] = [];
  for (const [key, value] of [["status", filters.status], ["owner", filters.owner]] as const) {
    if (value) { values.push(value); clauses.push(`item.${key}=$${firstParameter + values.length - 1}`); }
  }
  if (filters.overdue) clauses.push(filters.overdue === "true" ? "item.due_date < CURRENT_DATE AND item.status <> 'done'" : "(item.due_date IS NULL OR item.due_date >= CURRENT_DATE OR item.status = 'done')");
  return { where: clauses.length ? ` AND ${clauses.join(" AND ")}` : "", values };
}

export async function listSessionActionItems(sessionId: string, actorId: string, filters: ActionItemFilters = {}): Promise<SessionActionItem[]> {
  await getSessionActionItemsContext(sessionId, actorId);
  const filter = filterSql(filters, 2);
  const result = await pool.query<DatabaseActionItem>(
    `SELECT ${ACTION_ITEM_SELECT} FROM session_action_items item WHERE item.session_id=$1${filter.where} ORDER BY item.created_at,item.submission_index,item.id`,
    [sessionId, ...filter.values],
  );
  return normalizeRows(result.rows);
}

export async function listConnectionActionItems(connectionId: string, actorId: string, filters: ActionItemFilters = {}) {
  const connection = await pool.query<{ id: string }>(
    `SELECT connection.id FROM connections connection JOIN startups startup ON startup.id=connection.startup_id
     WHERE connection.id=$1 AND (startup.founder_id=$2 OR connection.mentor_id=$2)`, [connectionId, actorId],
  );
  if (!connection.rowCount) throw new NotFoundError("Connection not found");
  const filter = filterSql(filters, 2);
  const list = await pool.query<DatabaseActionItem>(
    `SELECT ${ACTION_ITEM_SELECT} FROM session_action_items item JOIN sessions session ON session.id=item.session_id
     WHERE session.connection_id=$1${filter.where} ORDER BY item.created_at,item.submission_index,item.id`, [connectionId, ...filter.values],
  );
  const counts = await pool.query<{ total: number; open: number; in_progress: number; done: number; blocked: number; overdue: number }>(
    `SELECT count(*)::int AS total,count(*) FILTER (WHERE item.status='open')::int AS open,
     count(*) FILTER (WHERE item.status='in_progress')::int AS in_progress,count(*) FILTER (WHERE item.status='done')::int AS done,
     count(*) FILTER (WHERE item.status='blocked')::int AS blocked,
     count(*) FILTER (WHERE item.due_date < CURRENT_DATE AND item.status <> 'done')::int AS overdue
     FROM session_action_items item JOIN sessions session ON session.id=item.session_id WHERE session.connection_id=$1`, [connectionId],
  );
  const row = counts.rows[0]!;
  return {
    actionItems: normalizeRows(list.rows),
    summary: { total: row.total, open: row.open, inProgress: row.in_progress, done: row.done, blocked: row.blocked, overdue: row.overdue, completionPercentage: row.total === 0 ? 0 : Math.round(row.done * 100 / row.total) },
  };
}

export async function updateSessionActionItem(itemId: string, actorId: string, expectedUpdatedAt: string, fields: Record<string, unknown>): Promise<SessionActionItem> {
  const fieldNames = ["title", "description", "owner", "dueDate", "priority", "status"] as const;
  const columns = { title: "title", description: "description", owner: "owner", dueDate: "due_date", priority: "priority", status: "status" } as const;
  const updates = fieldNames.filter((key) => Object.hasOwn(fields, key));
  if (!updates.length) throw new Error("At least one action item field is required");
  const values: unknown[] = updates.map((key) => fields[key]);
  const assignments = updates.map((key, index) => `${columns[key]}=$${index + 1}`).join(",");
  values.push(expectedUpdatedAt, itemId, actorId);
  const result = await pool.query<DatabaseActionItem>(
    `UPDATE session_action_items item SET ${assignments},updated_at=now()
     FROM sessions session JOIN startups startup ON startup.id=session.startup_id
     WHERE item.id=$${values.length - 1} AND item.updated_at=$${values.length - 2} AND session.id=item.session_id
       AND (startup.founder_id=$${values.length} OR session.mentor_id=$${values.length})
     RETURNING ${ACTION_ITEM_SELECT}`,
    values,
  );
  if (result.rows[0]) return normalizeRows(result.rows)[0]!;
  const accessible = await pool.query<{ updated_at: Date }>(
    `SELECT item.updated_at FROM session_action_items item JOIN sessions session ON session.id=item.session_id
     JOIN startups startup ON startup.id=session.startup_id WHERE item.id=$1 AND (startup.founder_id=$2 OR session.mentor_id=$2)`, [itemId, actorId],
  );
  if (!accessible.rowCount) throw new NotFoundError("Action item not found");
  throw new ConflictError("This action item changed since you loaded it. Refresh and try again.");
}

export async function saveSessionActionItems(
  sessionId: string,
  actorId: string,
  submissionId: string,
  items: ReviewedSessionActionItem[],
): Promise<SessionActionItem[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const participant = await client.query(
      `SELECT session.id FROM sessions session
       JOIN startups startup ON startup.id=session.startup_id
       WHERE session.id=$1 AND (startup.founder_id=$2 OR session.mentor_id=$2)
       FOR UPDATE OF session`,
      [sessionId, actorId],
    );
    if (!participant.rowCount) throw new NotFoundError("Session not found");

    // Serialize duplicate requests with the same actor and client-generated idempotency key.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [actorId, submissionId]);
    const existing = await client.query<DatabaseActionItem>(
    `SELECT ${ACTION_ITEM_SELECT} FROM session_action_items item WHERE item.created_by=$1 AND item.submission_id=$2 ORDER BY item.submission_index`,
      [actorId, submissionId],
    );
    if (existing.rowCount) {
      if (existing.rows[0]!.sessionId !== sessionId) throw new ConflictError("This submission ID was already used for another session");
      await client.query("COMMIT");
      return normalizeRows(existing.rows);
    }

    const saved: DatabaseActionItem[] = [];
    for (const [submissionIndex, item] of items.entries()) {
      const result = await client.query<DatabaseActionItem>(
        `INSERT INTO session_action_items
          (session_id,created_by,submission_id,submission_index,title,description,owner,due_date,priority,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open') RETURNING ${ACTION_ITEM_RETURNING}`,
        [sessionId, actorId, submissionId, submissionIndex, item.title, item.description, item.owner, item.dueDate, item.priority],
      );
      saved.push(result.rows[0]!);
    }
    await client.query("COMMIT");
    return normalizeRows(saved);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
