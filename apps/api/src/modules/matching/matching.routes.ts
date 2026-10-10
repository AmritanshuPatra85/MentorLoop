import { Router } from "express";
import { matchEventActionResponseSchema, matchEventActionSchema, matchCandidateTypeSchema, matchingWithStartupsResponseSchema, matchingWithExplanationsResponseSchema, matchingWeightsResponseSchema, matchingWeightsSchema } from "@mentorloop/shared";
import { z } from "zod";
import { db } from "../../db/client";
import { domains, mentorDomains, mentorProfiles, mentorSkills, mentorStages, skills, stages, startups, startupDomains, users } from "../../db/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { asyncHandler } from "../../lib/async-handler";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { requireAdmin } from "../../middleware/require-admin";
import { validate } from "../../middleware/validate";
import { pool } from "../../db/client";
import { ForbiddenError, ConflictError } from "../../lib/errors";
import { listEligibleMentorIds, listEligibleStartupIds } from "./eligibility.service";
import { rankCandidates, getMatchingWeights, setMatchingWeights } from "./matching.service";
import { explainRankedMentors } from "./explanations/explanation.service";

export const matchingRouter = Router();
matchingRouter.get("/mentors", requireAuth, requireRole("founder"), asyncHandler(async (req, res) => {
  const [founder] = await db.select({ id: users.id }).from(users).where(and(
    eq(users.id, req.auth!.userId), eq(users.status, "active"), isNotNull(users.emailVerifiedAt),
  )).limit(1);
  if (!founder) return res.status(403).json({ error: { code: "FOUNDER_NOT_APPROVED", message: "Active founder access is required" } });
  const [startup] = await db.select({ id: startups.id }).from(startups).where(and(eq(startups.founderId, founder.id), eq(startups.isComplete, true))).limit(1);
  if (!startup) return res.json(matchingWithExplanationsResponseSchema.parse({ matches: [] }));
  const ranked = await rankCandidates("mentor", req.auth!.userId);
  const matches = await explainRankedMentors(req.auth!.userId, ranked);
  const ids = matches.map((match) => match.candidateId);
  const savedRows = ids.length ? await pool.query<{ candidate_id: string }>(
    `SELECT candidate_mentor_id AS candidate_id FROM match_events
     WHERE actor_user_id=$1 AND candidate_type='mentor' AND event_type='save'
       AND candidate_mentor_id=ANY($2::uuid[])`, [req.auth!.userId, ids]) : { rows: [] };
  const savedIds = new Set(savedRows.rows.map((row) => row.candidate_id));
  const profiles = ids.length ? await db.select({
    id: users.id, name: users.fullName, avatarUrl: users.avatarUrl,
    currentRole: mentorProfiles.currentRole, organization: mentorProfiles.organization,
    bio: mentorProfiles.bio, experienceSummary: mentorProfiles.experienceSummary,
    yearsExperience: mentorProfiles.yearsExperience,
  }).from(mentorProfiles).innerJoin(users, eq(users.id, mentorProfiles.userId))
    .where(and(inArray(mentorProfiles.userId, ids), eq(users.status, "active"), isNotNull(users.emailVerifiedAt))) : [];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const [domainRows, skillRows, stageRows] = ids.length ? await Promise.all([
    db.select({ mentorId: mentorDomains.mentorId, name: domains.name }).from(mentorDomains).innerJoin(domains, eq(domains.id, mentorDomains.domainId)).where(inArray(mentorDomains.mentorId, ids)).orderBy(mentorDomains.displayOrder),
    db.select({ mentorId: mentorSkills.mentorId, name: skills.name }).from(mentorSkills).innerJoin(skills, eq(skills.id, mentorSkills.skillId)).where(inArray(mentorSkills.mentorId, ids)).orderBy(mentorSkills.displayOrder),
    db.select({ mentorId: mentorStages.mentorId, name: stages.name }).from(mentorStages).innerJoin(stages, eq(stages.id, mentorStages.stageId)).where(inArray(mentorStages.mentorId, ids)).orderBy(mentorStages.displayOrder),
  ]) : [[], [], []];
  const namesByMentor = <T extends { mentorId: string; name: string }>(rows: T[]) => {
    const result = new Map<string, string[]>();
    for (const row of rows) result.set(row.mentorId, [...(result.get(row.mentorId) ?? []), row.name]);
    return result;
  };
  const domainsByMentor = namesByMentor(domainRows); const skillsByMentor = namesByMentor(skillRows); const stagesByMentor = namesByMentor(stageRows);
  const enriched = matches.flatMap((match) => {
    const mentor = profileById.get(match.candidateId);
    if (!mentor) return [];
    return [{ ...match, saved: savedIds.has(match.candidateId), mentor: { ...mentor, domains: domainsByMentor.get(mentor.id) ?? [], skills: skillsByMentor.get(mentor.id) ?? [], mentorshipStages: stagesByMentor.get(mentor.id) ?? [] } }];
  });
  res.json(matchingWithExplanationsResponseSchema.parse({ matches: enriched }));
}));
matchingRouter.get("/startups", requireAuth, requireRole("mentor"), asyncHandler(async (req, res) => {
  const { rows } = await pool.query("SELECT 1 FROM users WHERE id=$1 AND status='active' AND email_verified_at IS NOT NULL AND role='mentor'", [req.auth!.userId]);
  if (!rows.length) return res.status(403).json({ error: { code: "MENTOR_NOT_APPROVED", message: "Approved mentor access is required" } });
  const ranked = await rankCandidates("startup", req.auth!.userId);
  const ids = ranked.map((match) => match.candidateId);
  const savedRows = ids.length ? await pool.query<{ candidate_id: string }>(
    `SELECT candidate_startup_id AS candidate_id FROM match_events
     WHERE actor_user_id=$1 AND candidate_type='startup' AND event_type='save'
       AND candidate_startup_id=ANY($2::uuid[])`, [req.auth!.userId, ids]) : { rows: [] };
  const savedIds = new Set(savedRows.rows.map((row) => row.candidate_id));
  const startupRows = ids.length ? await db.select({
    id: startups.id, name: startups.name, avatarUrl: users.avatarUrl,
    oneLiner: startups.oneLiner, description: startups.description, stageId: startups.stageId,
  }).from(startups).innerJoin(users, eq(users.id, startups.founderId)).where(and(
    inArray(startups.id, ids), eq(startups.isComplete, true), eq(users.status, "active"), isNotNull(users.emailVerifiedAt),
  )) : [];
  const profileById = new Map(startupRows.map((startup) => [startup.id, startup]));
  const domainRows = ids.length ? await db.select({ startupId: startupDomains.startupId, name: domains.name })
    .from(startupDomains).innerJoin(domains, eq(domains.id, startupDomains.domainId))
    .where(inArray(startupDomains.startupId, ids)).orderBy(startupDomains.displayOrder) : [];
  const domainNames = new Map<string, string[]>();
  for (const row of domainRows) domainNames.set(row.startupId, [...(domainNames.get(row.startupId) ?? []), row.name]);
  const stageIds = startupRows.flatMap((row) => row.stageId ? [row.stageId] : []);
  const stageRows = stageIds.length ? await db.select({ id: stages.id, name: stages.name }).from(stages).where(inArray(stages.id, stageIds)) : [];
  const stageNames = new Map(stageRows.map((row) => [row.id, row.name]));
  const enriched = ranked.flatMap((match) => {
    const startup = profileById.get(match.candidateId);
    if (!startup?.name) return [];
    return [{ ...match, saved: savedIds.has(match.candidateId), startup: {
      id: startup.id, name: startup.name, avatarUrl: startup.avatarUrl,
      oneLiner: startup.oneLiner, description: startup.description,
      domains: domainNames.get(startup.id) ?? [], stage: startup.stageId ? stageNames.get(startup.stageId) ?? null : null,
    } }];
  });
  res.json(matchingWithStartupsResponseSchema.parse({ matches: enriched }));
}));

const matchActionParamsSchema = z.object({ candidateType: matchCandidateTypeSchema, candidateId: z.string().uuid() });
matchingRouter.post(
  "/:candidateType/:candidateId/events",
  requireAuth,
  validate({ params: matchActionParamsSchema, body: matchEventActionSchema }),
  asyncHandler(async (req, res) => {
    const { candidateType, candidateId } = matchActionParamsSchema.parse(req.params);
    const { eventType, dismissalReason } = matchEventActionSchema.parse(req.body);
    const actorUserId = req.auth!.userId;
    const expectedRole = candidateType === "mentor" ? "founder" : "mentor";
    if (req.auth!.role !== expectedRole) throw new ForbiddenError("This discovery action is not available for your role", "ROLE_NOT_ALLOWED");
    const actor = await pool.query(
      "SELECT 1 FROM users WHERE id=$1 AND role=$2 AND status='active' AND email_verified_at IS NOT NULL",
      [actorUserId, expectedRole],
    );
    if (!actor.rowCount) throw new ForbiddenError("Active, verified access is required", "ACCOUNT_NOT_ACTIVE");

    const candidateColumn = candidateType === "mentor" ? "candidate_mentor_id" : "candidate_startup_id";
    const duplicate = eventType !== "view" ? await pool.query<{ id: string }>(
      `SELECT id FROM match_events WHERE actor_user_id=$1 AND candidate_type=$2
       AND ${candidateColumn}=$3 AND event_type=$4 LIMIT 1`,
      [actorUserId, candidateType, candidateId, eventType],
    ) : { rows: [] };
    if (duplicate.rows[0]) {
      res.json(matchEventActionResponseSchema.parse({ eventId: duplicate.rows[0].id, candidateType, candidateId, eventType, recorded: false }));
      return;
    }

    const eligible = candidateType === "mentor"
      ? await listEligibleMentorIds(actorUserId)
      : await listEligibleStartupIds(actorUserId);
    if (!eligible.includes(candidateId)) throw new ConflictError("This profile is not eligible in your current discovery feed");

    if (eventType === "view") {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${actorUserId}:${candidateType}:${candidateId}:view`]);
        const recent = await client.query<{ id: string }>(
          `SELECT id FROM match_events WHERE actor_user_id=$1 AND candidate_type=$2
           AND ${candidateColumn}=$3 AND event_type='view'
           AND created_at > statement_timestamp() - interval '30 minutes'
           ORDER BY created_at DESC LIMIT 1`, [actorUserId, candidateType, candidateId]);
        if (recent.rows[0]) {
          await client.query("COMMIT");
          res.json(matchEventActionResponseSchema.parse({ eventId: recent.rows[0].id, candidateType, candidateId, eventType, recorded: false }));
          return;
        }
        const created = await client.query<{ id: string }>(
          `INSERT INTO match_events (actor_user_id,candidate_type,${candidateColumn},event_type)
           VALUES ($1,$2,$3,'view') RETURNING id`, [actorUserId, candidateType, candidateId]);
        await client.query("COMMIT");
        res.status(201).json(matchEventActionResponseSchema.parse({ eventId: created.rows[0]!.id, candidateType, candidateId, eventType, recorded: true }));
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally { client.release(); }
      return;
    }

    const created = await pool.query<{ id: string }>(
      `INSERT INTO match_events (actor_user_id,candidate_type,${candidateColumn},event_type,dismissal_reason)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id`,
      [actorUserId, candidateType, candidateId, eventType, eventType === "dismiss" ? dismissalReason ?? null : null],
    );
    const savedEvent = created.rows[0] ?? (await pool.query<{ id: string }>(
      `SELECT id FROM match_events WHERE actor_user_id=$1 AND candidate_type=$2
       AND ${candidateColumn}=$3 AND event_type=$4 LIMIT 1`,
      [actorUserId, candidateType, candidateId, eventType],
    )).rows[0];
    res.status(created.rows[0] ? 201 : 200).json(matchEventActionResponseSchema.parse({
      eventId: savedEvent?.id ?? null, candidateType, candidateId, eventType, recorded: !!created.rows[0],
    }));
  }),
);

export const matchingAdminRouter = Router();
matchingAdminRouter.use(requireAuth, requireAdmin);
matchingAdminRouter.get("/weights", asyncHandler(async (_req, res) => {
  res.json(matchingWeightsResponseSchema.parse({ weights: await getMatchingWeights() }));
}));
matchingAdminRouter.put("/weights", validate({ body: z.object({ weights: matchingWeightsSchema }).strict() }), asyncHandler(async (req, res) => {
  res.json(matchingWeightsResponseSchema.parse({ weights: await setMatchingWeights(req.body.weights, req.auth!.userId) }));
}));
