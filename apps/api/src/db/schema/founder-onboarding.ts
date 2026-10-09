import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { domains, stages } from "./taxonomy";

export type PreferredSessionWindow = { day: number; start: string; end: string };

export const founderProfiles = pgTable("founder_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  founderTitle: text("founder_title"),
  linkedinUrl: text("linkedin_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const startups = pgTable("startups", {
  id: uuid("id").primaryKey().defaultRandom(),
  founderId: uuid("founder_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name"),
  oneLiner: text("one_liner"),
  description: text("description"),
  stageId: uuid("stage_id").references(() => stages.id, { onDelete: "set null" }),
  helpNeeded: text("help_needed"),
  goals: text("goals"),
  timezone: text("timezone"),
  preferredSessionTimes: jsonb("preferred_session_times")
    .$type<PreferredSessionWindow[]>()
    .notNull()
    .default([]),
  isComplete: boolean("is_complete").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const startupDomains = pgTable(
  "startup_domains",
  {
    startupId: uuid("startup_id")
      .notNull()
      .references(() => startups.id, { onDelete: "cascade" }),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (t) => [uniqueIndex("startup_domains_pair_uidx").on(t.startupId, t.domainId)],
);
