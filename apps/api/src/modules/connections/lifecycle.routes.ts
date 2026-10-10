import { Router } from "express";
import { eq } from "drizzle-orm";
import {
  connectionInboxResponseSchema,
  connectionResponseSchema,
  connectionTransitionSchema,
  createConnectionRequestSchema,
} from "@mentorloop/shared";
import { connections, mentorProfiles, startups, users } from "../../db/schema";
import { db, pool } from "../../db/client";
import { CONNECTION_DECLINE_COOLDOWN_DAYS, CONNECTION_PENDING_EXPIRY_DAYS } from "../../db/schema/connections";
import { asyncHandler } from "../../lib/async-handler";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors";
import { requireApproved } from "../../middleware/require-approved";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { validate } from "../../middleware/validate";
import { listEligibleMentorIds } from "../matching/eligibility.service";

export const connectionLifecycleRouter = Router();
connectionLifecycleRouter.use(requireAuth, requireApproved);

async function getConnection(id: string) {
  const [row] = await db.select({
    id: connections.id, startupId: connections.startupId, mentorId: connections.mentorId,
    initiatedBy: connections.initiatedBy, state: connections.state, introMessage: connections.introMessage,
    createdAt: connections.createdAt, expiresAt: connections.expiresAt, respondedAt: connections.respondedAt,
    startupName: startups.name, mentorName: users.fullName, mentorAvatarUrl: users.avatarUrl,
    currentRole: mentorProfiles.currentRole, organization: mentorProfiles.organization,
  }).from(connections).innerJoin(startups, eq(startups.id, connections.startupId))
    .innerJoin(users, eq(users.id, connections.mentorId))
    .innerJoin(mentorProfiles, eq(mentorProfiles.userId, connections.mentorId))
    .where(eq(connections.id, id)).limit(1);
  if (!row) return null;
  return connectionResponseSchema.parse({
    ...row, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt?.toISOString() ?? null,
    respondedAt: row.respondedAt?.toISOString() ?? null,
  });
}

connectionLifecycleRouter.get("/all", asyncHandler(async (req, res) => {
  const now = new Date();
  await pool.query("UPDATE connections SET state='expired',responded_at=$1,updated_at=$1 WHERE state IN ('requested','invited') AND expires_at<=$1", [now]);
  const rows = await db.select({
    id: connections.id, startupId: connections.startupId, mentorId: connections.mentorId,
    initiatedBy: connections.initiatedBy, state: connections.state, introMessage: connections.introMessage,
    createdAt: connections.createdAt, expiresAt: connections.expiresAt, respondedAt: connections.respondedAt,
    startupName: startups.name, mentorName: users.fullName, mentorAvatarUrl: users.avatarUrl,
    currentRole: mentorProfiles.currentRole, organization: mentorProfiles.organization,
  }).from(connections).innerJoin(startups, eq(startups.id, connections.startupId))
    .innerJoin(users, eq(users.id, connections.mentorId)).innerJoin(mentorProfiles, eq(mentorProfiles.userId, connections.mentorId))
    .where(req.auth!.role === "founder"
      ? eq(startups.founderId, req.auth!.userId)
      : eq(connections.mentorId, req.auth!.userId));
  res.json(connectionInboxResponseSchema.parse({ connections: rows.map((row) => ({
    ...row, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt?.toISOString() ?? null,
    respondedAt: row.respondedAt?.toISOString() ?? null,
  })) }));
}));

connectionLifecycleRouter.post("/requests", requireRole("founder"), validate({ body: createConnectionRequestSchema }), asyncHandler(async (req, res) => {
  const input = createConnectionRequestSchema.parse(req.body);
  const founderId = req.auth!.userId;
  if (!(await listEligibleMentorIds(founderId)).includes(input.mentorId)) {
    throw new ConflictError("This mentor is no longer eligible for a request");
  }
  const startupCheck = await pool.query("SELECT id FROM startups WHERE id=$1 AND founder_id=$2 AND is_complete=true", [input.startupId, founderId]);
  if (!startupCheck.rowCount) throw new NotFoundError("Completed startup profile not found");

  const client = await pool.connect();
  let id = ""; let created = false; let statusCode = 201;
  try {
    await client.query("BEGIN");
    const mentor = await client.query("SELECT profile.user_id FROM mentor_profiles profile JOIN users account ON account.id=profile.user_id " +
      "WHERE profile.user_id=$1 AND account.role='mentor' AND account.status='active' AND account.email_verified_at IS NOT NULL " +
      "AND profile.is_complete=true FOR UPDATE OF profile", [input.mentorId]);
    if (!mentor.rowCount) throw new NotFoundError("Approved mentor profile not found");
    const pair = await client.query("SELECT id,state,initiated_by,expires_at,last_declined_at FROM connections " +
      "WHERE startup_id=$1 AND mentor_id=$2 FOR UPDATE", [input.startupId, input.mentorId]);
    const old = pair.rows[0] as { id: string; state: string; initiated_by: string; expires_at: Date | null; last_declined_at: Date | null } | undefined;
    const now = new Date();
    if (old) {
      const pending = ["requested", "invited"].includes(old.state) && old.expires_at && old.expires_at > now;
      if (old.state === "accepted" || pending) {
        if (old.state === "requested" && old.initiated_by === founderId) { id = old.id; statusCode = 200; }
        else throw new ConflictError("A connection request or invitation already exists");
      }
      if (old.last_declined_at && old.last_declined_at.getTime() > now.getTime() - CONNECTION_DECLINE_COOLDOWN_DAYS * 86_400_000) {
        throw new ConflictError("This pair is in the 30-day decline cooldown");
      }
    }
    if (!id) {
      const expiresAt = new Date(now.getTime() + CONNECTION_PENDING_EXPIRY_DAYS * 86_400_000);
      const saved = old
        ? await client.query("UPDATE connections SET initiated_by=$3,state='requested',intro_message=$4,responded_at=NULL,expires_at=$5,updated_at=$6 WHERE id=$1 AND startup_id=$2 RETURNING id",
          [old.id, input.startupId, founderId, input.introMessage, expiresAt, now])
        : await client.query("INSERT INTO connections (startup_id,mentor_id,initiated_by,state,intro_message,expires_at) VALUES ($1,$2,$3,'requested',$4,$5) RETURNING id",
          [input.startupId, input.mentorId, founderId, input.introMessage, expiresAt]);
      id = saved.rows[0]!.id as string; created = true;
      await client.query("INSERT INTO match_events (actor_user_id,candidate_type,candidate_mentor_id,event_type,connection_id) VALUES ($1,'mentor',$2,'request',$3)", [founderId, input.mentorId, id]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "23505") throw new ConflictError("A connection request already exists");
    throw error;
  } finally { client.release(); }
  const result = await getConnection(id);
  if (!result) throw new Error("Saved connection was not found");
  res.status(created ? 201 : statusCode).json(result);
}));

connectionLifecycleRouter.post("/:connectionId/respond", validate({ body: connectionTransitionSchema }), asyncHandler(async (req, res) => {
  const { action } = connectionTransitionSchema.parse(req.body);
  const client = await pool.connect(); const actorId = req.auth!.userId;
  let id = ""; let expired = false;
  try {
    await client.query("BEGIN");
    const locked = await client.query("SELECT connection.id,connection.startup_id,connection.mentor_id,connection.initiated_by,connection.state,connection.expires_at,startup.founder_id " +
      "FROM connections connection JOIN startups startup ON startup.id=connection.startup_id WHERE connection.id=$1 FOR UPDATE OF connection", [req.params.connectionId]);
    const connection = locked.rows[0] as { id: string; startup_id: string; mentor_id: string; initiated_by: string; state: string; expires_at: Date | null; founder_id: string } | undefined;
    if (!connection) throw new NotFoundError("Connection not found");
    const recipient = connection.state === "requested" ? connection.mentor_id : connection.founder_id;
    const roleMatches = (req.auth!.role === "mentor" && actorId === connection.mentor_id)
      || (req.auth!.role === "founder" && actorId === connection.founder_id);
    if (!roleMatches || actorId !== recipient || actorId === connection.initiated_by) throw new ForbiddenError("Only the other participant can respond to this request");
    if (!["requested", "invited"].includes(connection.state)) throw new ConflictError("This connection is no longer awaiting a response");
    if (!connection.expires_at || connection.expires_at <= new Date()) {
      await client.query("UPDATE connections SET state='expired',responded_at=now(),updated_at=now() WHERE id=$1", [connection.id]);
      expired = true; id = connection.id;
    } else if (action === "accept") {
      await client.query("SELECT user_id FROM mentor_profiles WHERE user_id=$1 FOR UPDATE", [connection.mentor_id]);
      const account = await client.query("SELECT profile.max_mentees FROM mentor_profiles profile JOIN users mentor ON mentor.id=profile.user_id JOIN users founder ON founder.id=$2 " +
        "WHERE profile.user_id=$1 AND mentor.status='active' AND mentor.email_verified_at IS NOT NULL AND founder.status='active' AND founder.email_verified_at IS NOT NULL", [connection.mentor_id, connection.founder_id]);
      const capacity = account.rows[0]?.max_mentees;
      if (capacity == null) throw new ConflictError("Mentor capacity is not configured");
      const count = await client.query("SELECT count(*) AS count FROM connections WHERE mentor_id=$1 AND state='accepted'", [connection.mentor_id]);
      if (Number(count.rows[0]?.count ?? 0) >= capacity) throw new ConflictError("The mentor has no remaining connection capacity");
      await client.query("UPDATE connections SET state='accepted',responded_at=now(),updated_at=now() WHERE id=$1", [connection.id]); id = connection.id;
    } else {
      await client.query("UPDATE connections SET state='declined',last_declined_at=now(),responded_at=now(),updated_at=now() WHERE id=$1", [connection.id]); id = connection.id;
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { client.release(); }
  if (expired) throw new ConflictError("This connection expired before it was answered");
  const result = await getConnection(id);
  if (!result) throw new NotFoundError("Connection not found after update");
  res.json(result);
}));

connectionLifecycleRouter.post("/:connectionId/withdraw", asyncHandler(async (req, res) => {
  const result = await pool.query("UPDATE connections SET state='withdrawn',responded_at=now(),updated_at=now() " +
    "WHERE id=$1 AND initiated_by=$2 AND state IN ('requested','invited') RETURNING id", [req.params.connectionId, req.auth!.userId]);
  if (!result.rowCount) {
    const exists = await db.select({ id: connections.id, initiator: connections.initiatedBy, state: connections.state })
      .from(connections).where(eq(connections.id, req.params.connectionId!)).limit(1);
    if (!exists.length) throw new NotFoundError("Connection not found");
    if (exists[0]!.initiator !== req.auth!.userId) throw new ForbiddenError("Only the requester can withdraw this connection");
    throw new ConflictError("Only pending connections can be withdrawn");
  }
  res.json(await getConnection(req.params.connectionId!));
}));
