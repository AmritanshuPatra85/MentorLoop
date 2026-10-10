import { Router } from "express";
import { connectionInviteResponseSchema, createConnectionInviteSchema } from "@mentorloop/shared";
import { incomingConnectionInvitesResponseSchema } from "@mentorloop/shared";
import { and, eq, gt, isNotNull } from "drizzle-orm";
import { asyncHandler } from "../../lib/async-handler";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { validate } from "../../middleware/validate";
import { pool } from "../../db/client";
import { db } from "../../db/client";
import { CONNECTION_DECLINE_COOLDOWN_DAYS, CONNECTION_PENDING_EXPIRY_DAYS } from "../../db/schema/connections";
import { connections, mentorProfiles, startups, users } from "../../db/schema";
import { listEligibleStartupIds } from "../matching/eligibility.service";

export const connectionsRouter = Router();
connectionsRouter.use(requireAuth);

/** Show mentor invitations to the founder who owns the startup. */
connectionsRouter.get("/incoming", requireRole("founder"), asyncHandler(async (req, res) => {
  const [founder] = await db.select({ id: users.id }).from(users).where(and(
    eq(users.id, req.auth!.userId), eq(users.role, "founder"), eq(users.status, "active"), isNotNull(users.emailVerifiedAt),
  )).limit(1);
  if (!founder) throw new ForbiddenError("Active founder access is required", "FOUNDER_NOT_APPROVED");
  const now = new Date();
  const rows = await db.select({
    id: connections.id, startupId: connections.startupId, mentorId: connections.mentorId,
    mentorName: users.fullName, avatarUrl: users.avatarUrl,
    currentRole: mentorProfiles.currentRole, organization: mentorProfiles.organization,
    introMessage: connections.introMessage, sentAt: connections.createdAt, expiresAt: connections.expiresAt,
  }).from(connections)
    .innerJoin(startups, eq(startups.id, connections.startupId))
    .innerJoin(users, eq(users.id, connections.mentorId))
    .innerJoin(mentorProfiles, eq(mentorProfiles.userId, connections.mentorId))
    .where(and(
      eq(startups.founderId, req.auth!.userId), eq(connections.state, "invited"),
      gt(connections.expiresAt, now), eq(users.status, "active"), isNotNull(users.emailVerifiedAt),
    ));
  res.json(incomingConnectionInvitesResponseSchema.parse({ invites: rows.map((row) => ({ ...row, state: "invited" as const, sentAt: row.sentAt.toISOString(), expiresAt: row.expiresAt!.toISOString() })) }));
}));

/** Sprint 4.6: create a mentor-initiated invitation for an eligible startup. */
connectionsRouter.post(
  "/invites",
  requireRole("mentor"),
  validate({ body: createConnectionInviteSchema }),
  asyncHandler(async (req, res) => {
    const mentorId = req.auth!.userId;
    const { startupId, introMessage } = createConnectionInviteSchema.parse(req.body);
    // Reuse Sprint 4.1's eligibility contract, including active status, capacity, cooldown,
    // and a bookable window. Recheck mutable capacity and pair state under a row lock below.
    const eligibleStartupIds = await listEligibleStartupIds(mentorId);
    if (!eligibleStartupIds.includes(startupId)) {
      throw new ConflictError("This startup is no longer eligible for an invitation");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const mentor = await client.query<{ max_mentees: number | null }>(
        `SELECT profile.max_mentees FROM mentor_profiles profile
         JOIN users account ON account.id=profile.user_id
         WHERE profile.user_id=$1 AND account.role='mentor' AND account.status='active'
           AND account.email_verified_at IS NOT NULL AND profile.is_complete=true
         FOR UPDATE OF profile`,
        [mentorId],
      );
      if (!mentor.rows[0]) throw new ForbiddenError("Approved mentor access is required", "MENTOR_NOT_APPROVED");

      const startup = await client.query(
        `SELECT startup.id FROM startups startup JOIN users founder ON founder.id=startup.founder_id
         WHERE startup.id=$1 AND startup.is_complete=true AND founder.role='founder'
           AND founder.status='active' AND founder.email_verified_at IS NOT NULL`,
        [startupId],
      );
      if (!startup.rowCount) throw new NotFoundError("Startup profile not found");

      const capacity = await client.query<{ active_count: string }>(
        "SELECT count(*) AS active_count FROM connections WHERE mentor_id=$1 AND state='accepted'",
        [mentorId],
      );
      if (mentor.rows[0].max_mentees == null || Number(capacity.rows[0]?.active_count ?? 0) >= mentor.rows[0].max_mentees) {
        throw new ConflictError("The mentor has no remaining connection capacity");
      }

      const pair = await client.query<{ id: string; state: string; expires_at: Date | null; last_declined_at: Date | null }>(
        `SELECT id,state,expires_at,last_declined_at FROM connections
         WHERE startup_id=$1 AND mentor_id=$2 FOR UPDATE`,
        [startupId, mentorId],
      );
      const existing = pair.rows[0];
      const now = new Date();
      if (existing && (
        existing.state === "accepted" ||
        ((existing.state === "requested" || existing.state === "invited") && !!existing.expires_at && existing.expires_at > now) ||
        (!!existing.last_declined_at && existing.last_declined_at.getTime() > now.getTime() - CONNECTION_DECLINE_COOLDOWN_DAYS * 86_400_000)
      )) throw new ConflictError("A connection already exists or this pair is in the decline cooldown");

      const expiresAt = new Date(now.getTime() + CONNECTION_PENDING_EXPIRY_DAYS * 86_400_000);
      const saved = existing
        ? await client.query<{ id: string; created_at: Date }>(
            `UPDATE connections SET state='invited',initiated_by=$2,intro_message=$3,
               responded_at=NULL,expires_at=$4,updated_at=$5
             WHERE id=$1 RETURNING id,created_at`,
            [existing.id, mentorId, introMessage, expiresAt, now],
          )
        : await client.query<{ id: string; created_at: Date }>(
            `INSERT INTO connections (startup_id,mentor_id,initiated_by,state,intro_message,expires_at)
             VALUES ($1,$2,$3,'invited',$4,$5) RETURNING id,created_at`,
            [startupId, mentorId, mentorId, introMessage, expiresAt],
          );
      await client.query(
        `INSERT INTO match_events (actor_user_id,candidate_type,candidate_startup_id,event_type,connection_id)
         VALUES ($1,'startup',$2,'request',$3)`,
        [mentorId, startupId, saved.rows[0]!.id],
      );
      await client.query("COMMIT");
      res.status(existing ? 200 : 201).json(connectionInviteResponseSchema.parse({
        id: saved.rows[0]!.id,
        startupId,
        mentorId,
        state: "invited",
        introMessage,
        createdAt: saved.rows[0]!.created_at.toISOString(),
        expiresAt: expiresAt.toISOString(),
      }));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }),
);
