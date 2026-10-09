import { and, eq, inArray } from "drizzle-orm";
import type { MentorOnboardingDraft, MentorOnboardingProfile } from "@mentorloop/shared";
import { db } from "../../db/client";
import {
  domains,
  mentorDomains,
  mentorProfiles,
  mentorSkills,
  mentorStages,
  skills,
  stages,
  users,
} from "../../db/schema";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../lib/errors";
import { enqueueProfileEmbedding } from "../embeddings/embedding.queue";

export async function getMentorOnboarding(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new NotFoundError("Mentor account not found");
  const [profile] = await db
    .select()
    .from(mentorProfiles)
    .where(eq(mentorProfiles.userId, userId))
    .limit(1);
  if (!profile) return { profile: null };

  const [domainRows, skillRows, stageRows] = await Promise.all([
    db
      .select({ slug: domains.slug })
      .from(mentorDomains)
      .innerJoin(domains, eq(mentorDomains.domainId, domains.id))
      .where(eq(mentorDomains.mentorId, userId))
      .orderBy(mentorDomains.displayOrder),
    db
      .select({ slug: skills.slug })
      .from(mentorSkills)
      .innerJoin(skills, eq(mentorSkills.skillId, skills.id))
      .where(eq(mentorSkills.mentorId, userId))
      .orderBy(mentorSkills.displayOrder),
    db
      .select({ slug: stages.slug })
      .from(mentorStages)
      .innerJoin(stages, eq(mentorStages.stageId, stages.id))
      .where(eq(mentorStages.mentorId, userId))
      .orderBy(mentorStages.displayOrder),
  ]);

  const result: MentorOnboardingProfile = {
    mentorName: user.fullName,
    email: user.email,
    currentRole: profile.currentRole ?? "",
    organization: profile.organization ?? "",
    bio: profile.bio ?? "",
    experienceSummary: profile.experienceSummary ?? "",
    ...(profile.yearsExperience !== null
      ? { yearsExperience: profile.yearsExperience }
      : {}),
    domainSlugs: domainRows.map((row) => row.slug),
    skillSlugs: skillRows.map((row) => row.slug),
    stageSlugs: stageRows.map((row) => row.slug),
    helpTopics: profile.helpTopics ?? "",
    ...(profile.maxMentees !== null ? { maxMentees: profile.maxMentees } : {}),
    ...(profile.sessionLengthMinutes === null
      ? {}
      : { sessionLengthMinutes: profile.sessionLengthMinutes as 30 | 45 | 60 | 90 }),
    timezone: profile.timezone ?? "",
    preferredSessionTimes: profile.preferredSessionTimes,
    linkedinUrl: profile.linkedinUrl ?? "",
    websiteUrl: profile.websiteUrl ?? "",
    isComplete: profile.isComplete,
    updatedAt: profile.updatedAt.toISOString(),
  };
  return { profile: result };
}

export async function saveMentorOnboarding(
  userId: string,
  input: MentorOnboardingDraft,
  complete: boolean,
  options: { allowActiveEdit?: boolean; preserveAccountStatus?: boolean } = {},
) {
  const existing = await getMentorOnboarding(userId);
  const merged = { ...(existing.profile ?? {}), ...input };
  const domainSlugs = merged.domainSlugs ?? [];
  const skillSlugs = merged.skillSlugs ?? [];
  const stageSlugs = merged.stageSlugs ?? [];

  await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new NotFoundError("Mentor account not found");
    if (
      user.role !== "mentor" ||
      !user.emailVerifiedAt ||
      user.status === "suspended" ||
      (user.status === "active" && !options.allowActiveEdit)
    ) {
      throw new ForbiddenError(
        "This account cannot submit mentor onboarding",
        "ONBOARDING_NOT_ALLOWED",
      );
    }

    const domainRows = domainSlugs.length
      ? await tx
          .select({ id: domains.id, slug: domains.slug })
          .from(domains)
          .where(inArray(domains.slug, domainSlugs))
      : [];
    const skillRows = skillSlugs.length
      ? await tx
          .select({ id: skills.id, slug: skills.slug })
          .from(skills)
          .where(inArray(skills.slug, skillSlugs))
      : [];
    const stageRows = stageSlugs.length
      ? await tx
          .select({ id: stages.id, slug: stages.slug })
          .from(stages)
          .where(inArray(stages.slug, stageSlugs))
      : [];
    if (domainRows.length !== domainSlugs.length)
      throw new BadRequestError("One or more selected domains are unavailable");
    if (skillRows.length !== skillSlugs.length)
      throw new BadRequestError("One or more selected skills are unavailable");
    if (stageRows.length !== stageSlugs.length)
      throw new BadRequestError("One or more selected stages are unavailable");

    await tx
      .insert(mentorProfiles)
      .values({
        userId,
        currentRole: merged.currentRole || null,
        organization: merged.organization || null,
        bio: merged.bio || null,
        experienceSummary: merged.experienceSummary || null,
        yearsExperience: merged.yearsExperience ?? null,
        helpTopics: merged.helpTopics || null,
        maxMentees: merged.maxMentees ?? null,
        sessionLengthMinutes: merged.sessionLengthMinutes ?? null,
        timezone: merged.timezone || null,
        preferredSessionTimes: merged.preferredSessionTimes ?? [],
        linkedinUrl: merged.linkedinUrl || null,
        websiteUrl: merged.websiteUrl || null,
        isComplete: complete,
      })
      .onConflictDoUpdate({
        target: mentorProfiles.userId,
        set: {
          currentRole: merged.currentRole || null,
          organization: merged.organization || null,
          bio: merged.bio || null,
          experienceSummary: merged.experienceSummary || null,
          yearsExperience: merged.yearsExperience ?? null,
          helpTopics: merged.helpTopics || null,
          maxMentees: merged.maxMentees ?? null,
          sessionLengthMinutes: merged.sessionLengthMinutes ?? null,
          timezone: merged.timezone || null,
          preferredSessionTimes: merged.preferredSessionTimes ?? [],
          linkedinUrl: merged.linkedinUrl || null,
          websiteUrl: merged.websiteUrl || null,
          isComplete: complete,
          updatedAt: new Date(),
        },
      });

    await tx.delete(mentorDomains).where(eq(mentorDomains.mentorId, userId));
    await tx.delete(mentorSkills).where(eq(mentorSkills.mentorId, userId));
    await tx.delete(mentorStages).where(eq(mentorStages.mentorId, userId));
    if (domainRows.length)
      await tx.insert(mentorDomains).values(
        domainRows.map((row, order) => ({
          mentorId: userId,
          domainId: row.id,
          displayOrder: order,
        })),
      );
    if (skillRows.length)
      await tx.insert(mentorSkills).values(
        skillRows.map((row, order) => ({
          mentorId: userId,
          skillId: row.id,
          displayOrder: order,
        })),
      );
    if (stageRows.length)
      await tx.insert(mentorStages).values(
        stageRows.map((row, order) => ({
          mentorId: userId,
          stageId: row.id,
          displayOrder: order,
        })),
      );

    if (complete && user.status === "rejected" && !options.preserveAccountStatus) {
      await tx
        .update(users)
        .set({ status: "pending_approval", rejectionReason: null })
        .where(and(eq(users.id, userId), eq(users.status, "rejected")));
    }
  });

  await enqueueProfileEmbedding({ profileType: "mentor", profileId: userId });

  const [user] = await db
    .select({ status: users.status, rejectionReason: users.rejectionReason })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new NotFoundError("Mentor account not found");
  return {
    profile: (await getMentorOnboarding(userId)).profile!,
    status: user.status,
    rejectionReason: user.status === "rejected" ? user.rejectionReason : null,
  };
}
