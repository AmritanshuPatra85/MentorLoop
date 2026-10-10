import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sessions } from "./sessions";
import { users } from "./users";

export type SessionBriefDigest = {
  summary: string;
  key_questions: string[];
  suggested_focus: string;
};

export const sessionBriefs = pgTable("session_briefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  founderId: uuid("founder_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  currentStatus: text("current_status").notNull(),
  specificQuestions: text("specific_questions").notNull(),
  desiredOutcome: text("desired_outcome").notNull(),
  contentHash: text("content_hash").notNull(),
  digest: jsonb("digest").$type<SessionBriefDigest>(),
  digestStatus: text("digest_status").$type<"pending" | "ready" | "failed">().notNull().default("pending"),
  digestModel: text("digest_model"),
  digestGeneratedAt: timestamp("digest_generated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("session_briefs_session_uidx").on(table.sessionId),
  index("session_briefs_founder_idx").on(table.founderId),
  check("session_briefs_digest_status_ck", sql`${table.digestStatus} IN ('pending','ready','failed')`),
  check("session_briefs_current_status_ck", sql`length(btrim(${table.currentStatus})) BETWEEN 1 AND 2000`),
  check("session_briefs_specific_questions_ck", sql`length(btrim(${table.specificQuestions})) BETWEEN 1 AND 2000`),
  check("session_briefs_desired_outcome_ck", sql`length(btrim(${table.desiredOutcome})) BETWEEN 1 AND 2000`),
  check("session_briefs_content_hash_ck", sql`${table.contentHash} ~ '^[a-f0-9]{64}$'`),
]);
