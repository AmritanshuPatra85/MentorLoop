import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { domains, skills, stages } from "./taxonomy";
import { users } from "./users";
import type { PreferredSessionWindow } from "./founder-onboarding";

export const mentorProfiles = pgTable(
  "mentor_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    currentRole: text("current_role"),
    organization: text("organization"),
    bio: text("bio"),
    experienceSummary: text("experience_summary"),
    yearsExperience: integer("years_experience"),
    helpTopics: text("help_topics"),
    maxMentees: integer("max_mentees"),
    sessionLengthMinutes: integer("session_length_minutes"),
    bufferMinutes: integer("buffer_minutes").notNull().default(0),
    minimumNoticeMinutes: integer("minimum_notice_minutes").notNull().default(0),
    timezone: text("timezone"),
    preferredSessionTimes: jsonb("preferred_session_times")
      .$type<PreferredSessionWindow[]>()
      .notNull()
      .default([]),
    linkedinUrl: text("linkedin_url"),
    websiteUrl: text("website_url"),
    isComplete: boolean("is_complete").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("mentor_profiles_buffer_nonnegative_ck", sql`${table.bufferMinutes} >= 0`),
    check(
      "mentor_profiles_minimum_notice_nonnegative_ck",
      sql`${table.minimumNoticeMinutes} >= 0`,
    ),
  ],
);

export const mentorDomains = pgTable(
  "mentor_domains",
  {
    mentorId: uuid("mentor_id")
      .notNull()
      .references(() => mentorProfiles.userId, { onDelete: "cascade" }),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (table) => [uniqueIndex("mentor_domains_pair_uidx").on(table.mentorId, table.domainId)],
);

export const mentorSkills = pgTable(
  "mentor_skills",
  {
    mentorId: uuid("mentor_id")
      .notNull()
      .references(() => mentorProfiles.userId, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (table) => [uniqueIndex("mentor_skills_pair_uidx").on(table.mentorId, table.skillId)],
);

export const mentorStages = pgTable(
  "mentor_stages",
  {
    mentorId: uuid("mentor_id")
      .notNull()
      .references(() => mentorProfiles.userId, { onDelete: "cascade" }),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => stages.id, { onDelete: "cascade" }),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (table) => [uniqueIndex("mentor_stages_pair_uidx").on(table.mentorId, table.stageId)],
);
