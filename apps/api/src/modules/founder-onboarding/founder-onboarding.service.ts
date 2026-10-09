import { and, eq, inArray } from "drizzle-orm";
import type {
  FounderOnboardingDraft,
  FounderOnboardingProfile,
} from "@mentorloop/shared";
import { db } from "../../db/client";
import {
  domains,
  founderProfiles,
  stages,
  startupDomains,
  startups,
  users,
} from "../../db/schema";
import { BadRequestError, NotFoundError } from "../../lib/errors";
import { enqueueProfileEmbedding } from "../embeddings/embedding.queue";

export async function getFounderOnboarding(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new NotFoundError("Founder account not found");
  const [profile] = await db
    .select()
    .from(founderProfiles)
    .where(eq(founderProfiles.userId, userId))
    .limit(1);
  const [startup] = await db
    .select()
    .from(startups)
    .where(eq(startups.founderId, userId))
    .limit(1);
  if (!startup) return { profile: null };
  const selectedDomains = await db
    .select({ slug: domains.slug })
    .from(startupDomains)
    .innerJoin(domains, eq(startupDomains.domainId, domains.id))
    .where(eq(startupDomains.startupId, startup.id))
    .orderBy(startupDomains.displayOrder);
  const [stage] = startup.stageId
    ? await db
        .select({ slug: stages.slug })
        .from(stages)
        .where(eq(stages.id, startup.stageId))
        .limit(1)
    : [];
  const result: FounderOnboardingProfile = {
    founderName: user.fullName,
    email: user.email,
    founderTitle: profile?.founderTitle ?? "",
    linkedinUrl: profile?.linkedinUrl ?? "",
    startupName: startup.name ?? "",
    oneLiner: startup.oneLiner ?? "",
    description: startup.description ?? "",
    domainSlugs: selectedDomains.map((domain) => domain.slug),
    ...(selectedDomains.length
      ? {
          primaryDomainSlug:
            (await getPrimaryDomainSlug(startup.id)) ?? selectedDomains[0]!.slug,
        }
      : {}),
    ...(stage ? { stageSlug: stage.slug } : {}),
    helpNeeded: startup.helpNeeded ?? "",
    goals: startup.goals ?? "",
    timezone: startup.timezone ?? "",
    preferredSessionTimes: startup.preferredSessionTimes,
    isComplete: startup.isComplete,
    updatedAt: startup.updatedAt.toISOString(),
  };
  return { profile: result };
}

async function getPrimaryDomainSlug(startupId: string) {
  const [row] = await db
    .select({ slug: domains.slug })
    .from(startupDomains)
    .innerJoin(domains, eq(startupDomains.domainId, domains.id))
    .where(
      and(eq(startupDomains.startupId, startupId), eq(startupDomains.isPrimary, true)),
    )
    .limit(1);
  return row?.slug;
}

export async function saveFounderOnboarding(
  userId: string,
  input: FounderOnboardingDraft,
  complete: boolean,
) {
  const existing = await getFounderOnboarding(userId);
  const merged = { ...(existing.profile ?? {}), ...input };
  const domainSlugs = merged.domainSlugs ?? [];
  if (merged.primaryDomainSlug && !domainSlugs.includes(merged.primaryDomainSlug)) {
    throw new BadRequestError("The primary domain must be one of the selected domains");
  }
  if (complete && (!merged.stageSlug || !merged.primaryDomainSlug)) {
    throw new BadRequestError(
      "Choose a startup stage and primary domain before completing onboarding",
    );
  }

  let savedStartupId: string | undefined;
  await db.transaction(async (tx) => {
    const [founder] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!founder) throw new NotFoundError("Founder account not found");

    if (merged.domainSlugs?.length) {
      const found = await tx
        .select({ id: domains.id, slug: domains.slug })
        .from(domains)
        .where(inArray(domains.slug, merged.domainSlugs));
      if (found.length !== merged.domainSlugs.length)
        throw new BadRequestError("One or more selected domains are unavailable");
    }
    const [stage] = merged.stageSlug
      ? await tx
          .select({ id: stages.id })
          .from(stages)
          .where(eq(stages.slug, merged.stageSlug))
          .limit(1)
      : [];
    if (merged.stageSlug && !stage)
      throw new BadRequestError("The selected startup stage is unavailable");

    await tx
      .insert(founderProfiles)
      .values({
        userId,
        founderTitle: merged.founderTitle || null,
        linkedinUrl: merged.linkedinUrl || null,
      })
      .onConflictDoUpdate({
        target: founderProfiles.userId,
        set: {
          founderTitle: merged.founderTitle || null,
          linkedinUrl: merged.linkedinUrl || null,
          updatedAt: new Date(),
        },
      });

    const [startup] = await tx
      .insert(startups)
      .values({
        founderId: userId,
        name: merged.startupName || null,
        oneLiner: merged.oneLiner || null,
        description: merged.description || null,
        stageId: stage?.id ?? null,
        helpNeeded: merged.helpNeeded || null,
        goals: merged.goals || null,
        timezone: merged.timezone || null,
        preferredSessionTimes: merged.preferredSessionTimes ?? [],
        isComplete: complete,
      })
      .onConflictDoUpdate({
        target: startups.founderId,
        set: {
          name: merged.startupName || null,
          oneLiner: merged.oneLiner || null,
          description: merged.description || null,
          stageId: stage?.id ?? null,
          helpNeeded: merged.helpNeeded || null,
          goals: merged.goals || null,
          timezone: merged.timezone || null,
          preferredSessionTimes: merged.preferredSessionTimes ?? [],
          isComplete: complete,
          updatedAt: new Date(),
        },
      })
      .returning({ id: startups.id });
    if (!startup) throw new Error("Startup profile was not saved");
    savedStartupId = startup.id;

    await tx.delete(startupDomains).where(eq(startupDomains.startupId, startup.id));
    if (merged.domainSlugs?.length) {
      const selected = await tx
        .select({ id: domains.id, slug: domains.slug })
        .from(domains)
        .where(inArray(domains.slug, merged.domainSlugs));
      await tx.insert(startupDomains).values(
        selected.map((domain, index) => ({
          startupId: startup.id,
          domainId: domain.id,
          isPrimary: domain.slug === merged.primaryDomainSlug,
          displayOrder: index,
        })),
      );
    }
  });

  if (!savedStartupId) throw new Error("Startup profile was not saved");
  await enqueueProfileEmbedding({ profileType: "startup", profileId: savedStartupId });
  return (await getFounderOnboarding(userId)).profile!;
}
