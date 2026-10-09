import { and, asc, eq } from "drizzle-orm";
import type { AdminMentorApplication } from "@mentorloop/shared";
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
import { ConflictError, NotFoundError } from "../../lib/errors";

async function getApplication(mentorId: string): Promise<AdminMentorApplication | null> {
  const [row] = await db
    .select({
      mentorId: users.id,
      role: users.role,
      fullName: users.fullName,
      email: users.email,
      status: users.status,
      rejectionReason: users.rejectionReason,
      submittedAt: mentorProfiles.updatedAt,
      currentRole: mentorProfiles.currentRole,
      organization: mentorProfiles.organization,
      yearsExperience: mentorProfiles.yearsExperience,
      bio: mentorProfiles.bio,
      experienceSummary: mentorProfiles.experienceSummary,
      helpTopics: mentorProfiles.helpTopics,
      maxMentees: mentorProfiles.maxMentees,
      sessionLengthMinutes: mentorProfiles.sessionLengthMinutes,
      timezone: mentorProfiles.timezone,
      preferredSessionTimes: mentorProfiles.preferredSessionTimes,
      linkedinUrl: mentorProfiles.linkedinUrl,
      websiteUrl: mentorProfiles.websiteUrl,
      isComplete: mentorProfiles.isComplete,
    })
    .from(users)
    .innerJoin(mentorProfiles, eq(users.id, mentorProfiles.userId))
    .where(eq(users.id, mentorId))
    .limit(1);

  if (!row || row.role !== "mentor") return null;
  if (!row.isComplete) return null;

  const [domainRows, skillRows, stageRows] = await Promise.all([
    db
      .select({ name: domains.name })
      .from(mentorDomains)
      .innerJoin(domains, eq(mentorDomains.domainId, domains.id))
      .where(eq(mentorDomains.mentorId, mentorId))
      .orderBy(asc(mentorDomains.displayOrder)),
    db
      .select({ name: skills.name })
      .from(mentorSkills)
      .innerJoin(skills, eq(mentorSkills.skillId, skills.id))
      .where(eq(mentorSkills.mentorId, mentorId))
      .orderBy(asc(mentorSkills.displayOrder)),
    db
      .select({ name: stages.name })
      .from(mentorStages)
      .innerJoin(stages, eq(mentorStages.stageId, stages.id))
      .where(eq(mentorStages.mentorId, mentorId))
      .orderBy(asc(mentorStages.displayOrder)),
  ]);

  return {
    mentorId: row.mentorId,
    fullName: row.fullName,
    email: row.email,
    status: row.status,
    rejectionReason: row.rejectionReason,
    submittedAt: row.submittedAt.toISOString(),
    currentRole: row.currentRole ?? "",
    organization: row.organization ?? "",
    yearsExperience: row.yearsExperience,
    bio: row.bio ?? "",
    experienceSummary: row.experienceSummary ?? "",
    domainNames: domainRows.map((item) => item.name),
    skillNames: skillRows.map((item) => item.name),
    stageNames: stageRows.map((item) => item.name),
    helpTopics: row.helpTopics ?? "",
    maxMentees: row.maxMentees,
    sessionLengthMinutes: row.sessionLengthMinutes,
    timezone: row.timezone ?? "",
    preferredSessionTimes: row.preferredSessionTimes,
    linkedinUrl: row.linkedinUrl ?? "",
    websiteUrl: row.websiteUrl ?? "",
  };
}

export async function listPendingMentorApplications() {
  const rows = await db
    .select({ mentorId: users.id })
    .from(users)
    .innerJoin(mentorProfiles, eq(users.id, mentorProfiles.userId))
    .where(
      and(
        eq(users.role, "mentor"),
        eq(users.status, "pending_approval"),
        eq(mentorProfiles.isComplete, true),
      ),
    )
    .orderBy(asc(mentorProfiles.updatedAt));
  const applications = await Promise.all(rows.map((row) => getApplication(row.mentorId)));
  return {
    applications: applications.filter(
      (item): item is AdminMentorApplication => item !== null,
    ),
  };
}

export async function decideMentorApplication(
  mentorId: string,
  decision: "approve" | "reject",
  reason?: string,
) {
  return db.transaction(async (tx) => {
    const [mentor] = await tx
      .select({
        id: users.id,
        role: users.role,
        status: users.status,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, mentorId))
      .for("update")
      .limit(1);
    if (!mentor || mentor.role !== "mentor")
      throw new NotFoundError("Mentor application not found");
    if (mentor.status !== "pending_approval") {
      throw new ConflictError("Only pending mentor applications can be decided");
    }
    if (!mentor.emailVerifiedAt) {
      throw new ConflictError("The mentor must verify their email before review");
    }
    const [profile] = await tx
      .select({ isComplete: mentorProfiles.isComplete })
      .from(mentorProfiles)
      .where(eq(mentorProfiles.userId, mentorId))
      .limit(1);
    if (!profile?.isComplete)
      throw new ConflictError("The mentor profile is not complete");

    const status = decision === "approve" ? "active" : "rejected";
    const rejectionReason = decision === "reject" ? reason!.trim() : null;
    const [updated] = await tx
      .update(users)
      .set({ status, rejectionReason, updatedAt: new Date() })
      .where(and(eq(users.id, mentorId), eq(users.status, "pending_approval")))
      .returning({
        id: users.id,
        status: users.status,
        rejectionReason: users.rejectionReason,
      });
    if (!updated) throw new ConflictError("This mentor application was already decided");
    return {
      mentorId: updated.id,
      status: updated.status,
      rejectionReason: updated.rejectionReason,
    };
  });
}
