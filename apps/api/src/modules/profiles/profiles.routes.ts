import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, isNotNull } from "drizzle-orm";
import { Router, type RequestHandler } from "express";
import {
  avatarResponseSchema,
  avatarUploadSchema,
  founderProfileUpdateSchema,
  mentorProfileUpdateSchema,
  publicMentorProfileSchema,
  publicStartupProfileSchema,
} from "@mentorloop/shared";
import { db } from "../../db/client";
import { pool } from "../../db/client";
import {
  domains,
  mentorDomains,
  mentorProfiles,
  mentorSkills,
  mentorStages,
  skills,
  stages,
  startupDomains,
  startups,
  users,
} from "../../db/schema";
import { asyncHandler } from "../../lib/async-handler";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../lib/errors";
import { requireAuth } from "../../middleware/require-auth";
import {
  getFounderOnboarding,
  saveFounderOnboarding,
} from "../founder-onboarding/founder-onboarding.service";
import {
  getMentorOnboarding,
  saveMentorOnboarding,
} from "../mentor-onboarding/mentor-onboarding.service";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
export const avatarDirectory = resolve(
  process.env.AVATAR_STORAGE_DIR ?? resolve(moduleDirectory, "../../../uploads/avatars"),
);
const MAX_AVATAR_BYTES = 512 * 1024;
const imageTypes = {
  "image/png": {
    extension: ".png",
    matches: (bytes: Buffer) =>
      bytes.length >= 45 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes.toString("ascii", 12, 16) === "IHDR" &&
      bytes.subarray(-12, -8).equals(Buffer.from([0, 0, 0, 0])) &&
      bytes.toString("ascii", bytes.length - 8, bytes.length - 4) === "IEND",
  },
  "image/jpeg": {
    extension: ".jpg",
    matches: (bytes: Buffer) =>
      bytes.length >= 4 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff &&
      bytes[bytes.length - 2] === 0xff &&
      bytes[bytes.length - 1] === 0xd9,
  },
  "image/webp": {
    extension: ".webp",
    matches: (bytes: Buffer) =>
      bytes.length >= 20 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.readUInt32LE(4) + 8 === bytes.length &&
      bytes.toString("ascii", 8, 12) === "WEBP",
  },
} as const;

async function currentUser(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new NotFoundError("Account no longer exists");
  if (!user.emailVerifiedAt || user.status === "suspended") {
    throw new ForbiddenError(
      "Verify your email and make sure your account is active",
      "PROFILE_NOT_ALLOWED",
    );
  }
  if (user.role !== "founder" && user.role !== "mentor") {
    throw new ForbiddenError(
      "Only founders and mentors have editable profiles",
      "ROLE_NOT_ALLOWED",
    );
  }
  return user;
}

export const profilesRouter = Router();
profilesRouter.use(requireAuth);

profilesRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const user = await currentUser(req.auth!.userId);
    const data =
      user.role === "founder"
        ? await getFounderOnboarding(user.id)
        : await getMentorOnboarding(user.id);
    let publicProfilePath: string | null = null;
    if (user.role === "founder") {
      const [startup] = await db
        .select({ id: startups.id, isComplete: startups.isComplete })
        .from(startups)
        .where(eq(startups.founderId, user.id))
        .limit(1);
      if (startup?.isComplete) publicProfilePath = `/startups/${startup.id}`;
    } else if (user.status === "active" && data.profile?.isComplete) {
      publicProfilePath = `/mentors/${user.id}`;
    }
    res.json({
      role: user.role,
      avatarUrl: user.avatarUrl,
      publicProfilePath,
      profile: data.profile,
    });
  }),
);

profilesRouter.put(
  "/me",
  asyncHandler(async (req, res) => {
    const user = await currentUser(req.auth!.userId);
    if (user.role === "founder") {
      const input = founderProfileUpdateSchema.parse(req.body);
      const previous = await getFounderOnboarding(user.id);
      const profile = await saveFounderOnboarding(
        user.id,
        input,
        previous.profile?.isComplete ?? false,
      );
      res.json({ role: "founder", avatarUrl: user.avatarUrl, profile });
      return;
    }
    const input = mentorProfileUpdateSchema.parse(req.body);
    const previous = await getMentorOnboarding(user.id);
    const result = await saveMentorOnboarding(
      user.id,
      input,
      previous.profile?.isComplete ?? false,
      { allowActiveEdit: true, preserveAccountStatus: true },
    );
    const [updatedUser] = await db
      .select({ avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    res.json({
      role: "mentor",
      avatarUrl: updatedUser?.avatarUrl ?? null,
      profile: result.profile,
    });
  }),
);

profilesRouter.post(
  "/me/avatar",
  asyncHandler(async (req, res) => {
    const user = await currentUser(req.auth!.userId);
    const { mimeType, data } = avatarUploadSchema.parse(req.body);
    const bytes = Buffer.from(data, "base64");
    const type = imageTypes[mimeType];
    if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES || !type.matches(bytes)) {
      throw new BadRequestError("Upload a valid PNG, JPEG, or WebP image up to 512 KB");
    }
    const filename = `${randomUUID()}${type.extension}`;
    await mkdir(avatarDirectory, { recursive: true });
    const destination = resolve(avatarDirectory, filename);
    await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
    const avatarUrl = `/uploads/avatars/${filename}`;
    try {
      await db
        .update(users)
        .set({ avatarUrl, updatedAt: new Date() })
        .where(eq(users.id, user.id));
    } catch (error) {
      await unlink(destination).catch(() => undefined);
      throw error;
    }
    const previousFilename = user.avatarUrl?.match(
      /^\/uploads\/avatars\/([0-9a-f-]{36}\.(?:png|jpg|webp))$/i,
    )?.[1];
    if (previousFilename)
      await unlink(resolve(avatarDirectory, previousFilename)).catch(() => undefined);
    res.json(avatarResponseSchema.parse({ avatarUrl }));
  }),
);

profilesRouter.delete(
  "/me/avatar",
  asyncHandler(async (req, res) => {
    const user = await currentUser(req.auth!.userId);
    await db
      .update(users)
      .set({ avatarUrl: null, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    const filename = user.avatarUrl?.match(
      /^\/uploads\/avatars\/([0-9a-f-]{36}\.(?:png|jpg|webp))$/i,
    )?.[1];
    if (filename) await unlink(resolve(avatarDirectory, filename)).catch(() => undefined);
    res.json(avatarResponseSchema.parse({ avatarUrl: "" }));
  }),
);

const sendAvatar: RequestHandler = asyncHandler(async (req, res) => {
  const filename = String(req.params.filename ?? "");
  if (!/^[0-9a-f-]{36}\.(?:png|jpg|webp)$/i.test(filename))
    throw new NotFoundError("Avatar not found");
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(filename, { root: avatarDirectory }, (error) => {
    if (error && !res.headersSent) res.status(404).end();
  });
});

export const avatarFilesRouter = Router();
avatarFilesRouter.get("/:filename", sendAvatar);

function publicLink(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const uuidParam =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const publicMentor: RequestHandler = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!uuidParam.test(id)) throw new NotFoundError("Mentor profile not found");
  const [user] = await db
    .select({ id: users.id, fullName: users.fullName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(
      and(
        eq(users.id, id),
        eq(users.role, "mentor"),
        eq(users.status, "active"),
        isNotNull(users.emailVerifiedAt),
      ),
    )
    .limit(1);
  if (!user) throw new NotFoundError("Mentor profile not found");
  const [profile] = await db
    .select()
    .from(mentorProfiles)
    .where(and(eq(mentorProfiles.userId, id), eq(mentorProfiles.isComplete, true)))
    .limit(1);
  if (!profile) throw new NotFoundError("Mentor profile not found");
  const [domainRows, skillRows, stageRows] = await Promise.all([
    db
      .select({ name: domains.name })
      .from(mentorDomains)
      .innerJoin(domains, eq(mentorDomains.domainId, domains.id))
      .where(eq(mentorDomains.mentorId, id))
      .orderBy(mentorDomains.displayOrder),
    db
      .select({ name: skills.name })
      .from(mentorSkills)
      .innerJoin(skills, eq(mentorSkills.skillId, skills.id))
      .where(eq(mentorSkills.mentorId, id))
      .orderBy(mentorSkills.displayOrder),
    db
      .select({ name: stages.name })
      .from(mentorStages)
      .innerJoin(stages, eq(mentorStages.stageId, stages.id))
      .where(eq(mentorStages.mentorId, id))
      .orderBy(mentorStages.displayOrder),
  ]);
  const [{ rows: aggregateRows }, { rows: publicFeedback }] = await Promise.all([pool.query<{ average_rating: string | null; rating_count: string }>(
    `SELECT avg(rating)::text average_rating,count(*)::text rating_count FROM session_feedback f JOIN sessions s ON s.id=f.session_id AND s.status='completed' WHERE f.rated_mentor_id=$1`, [id]), pool.query<{ rating:number; tags:string[]; comment:string|null; created_at:Date }>(
    `SELECT f.rating,f.tags,f.comment,f.created_at FROM session_feedback f JOIN sessions s ON s.id=f.session_id AND s.status='completed'
     WHERE f.rated_mentor_id=$1 AND f.visibility='public_to_mentor' AND f.author_user_id<>$1 ORDER BY f.created_at DESC LIMIT 5`, [id])]);
  const aggregate=aggregateRows[0];
  res.json(
    publicMentorProfileSchema.parse({
      name: user.fullName,
      avatarUrl: user.avatarUrl,
      currentRole: profile.currentRole,
      organization: profile.organization,
      bio: profile.bio,
      experienceSummary: profile.experienceSummary,
      yearsExperience: profile.yearsExperience,
      domains: domainRows.map((r) => r.name),
      skills: skillRows.map((r) => r.name),
      mentorshipStages: stageRows.map((r) => r.name),
      linkedinUrl: publicLink(profile.linkedinUrl),
      websiteUrl: publicLink(profile.websiteUrl),
      averageRating: aggregate?.average_rating === null || aggregate?.average_rating === undefined ? null : Number(aggregate.average_rating),
      ratingCount: Number(aggregate?.rating_count ?? 0),
      publicFeedback: publicFeedback.map((item) => ({ rating:item.rating,tags:item.tags,comment:item.comment,createdAt:item.created_at.toISOString() })),
    }),
  );
});

const publicStartup: RequestHandler = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!uuidParam.test(id)) throw new NotFoundError("Startup profile not found");
  const [row] = await db
    .select({
      id: startups.id,
      name: startups.name,
      oneLiner: startups.oneLiner,
      description: startups.description,
      stageId: startups.stageId,
      founderId: startups.founderId,
      avatarUrl: users.avatarUrl,
    })
    .from(startups)
    .innerJoin(users, eq(startups.founderId, users.id))
    .where(
      and(
        eq(startups.id, id),
        eq(startups.isComplete, true),
        eq(users.role, "founder"),
        eq(users.status, "active"),
        isNotNull(users.emailVerifiedAt),
      ),
    )
    .limit(1);
  if (!row || !row.name) throw new NotFoundError("Startup profile not found");
  const [domainRows] = await Promise.all([
    db
      .select({ name: domains.name })
      .from(startupDomains)
      .innerJoin(domains, eq(startupDomains.domainId, domains.id))
      .where(eq(startupDomains.startupId, id))
      .orderBy(startupDomains.displayOrder),
  ]);
  const [stage] = row.stageId
    ? await db
        .select({ name: stages.name })
        .from(stages)
        .where(eq(stages.id, row.stageId))
        .limit(1)
    : [];
  res.json(
    publicStartupProfileSchema.parse({
      id,
      name: row.name,
      avatarUrl: row.avatarUrl,
      oneLiner: row.oneLiner,
      description: row.description,
      domains: domainRows.map((r) => r.name),
      stage: stage?.name ?? null,
    }),
  );
});

export const publicProfilesRouter = Router();
publicProfilesRouter.get("/mentors/:id", publicMentor);
publicProfilesRouter.get("/startups/:id", publicStartup);
