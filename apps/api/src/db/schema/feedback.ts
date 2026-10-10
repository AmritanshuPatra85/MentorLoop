import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid, integer } from "drizzle-orm/pg-core";
import { sessions } from "./sessions";
import { users } from "./users";
import { mentorProfiles } from "./mentor-onboarding";
import { connections } from "./connections";

export const sessionFeedback = pgTable("session_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id").notNull().references(() => connections.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ratedMentorId: uuid("rated_mentor_id").references(() => mentorProfiles.userId, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  tags: text("tags").array().notNull().default([]),
  comment: text("comment"),
  visibility: text("visibility").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("session_feedback_session_author_uidx").on(table.sessionId, table.authorUserId),
  index("session_feedback_mentor_created_idx").on(table.ratedMentorId, table.createdAt),
  index("session_feedback_visibility_idx").on(table.visibility, table.createdAt),
  check("session_feedback_rating_ck", sql`${table.rating} BETWEEN 1 AND 5`),
  check("session_feedback_visibility_ck", sql`${table.visibility} IN ('public_to_mentor','admin_private')`),
  check("session_feedback_tags_ck", sql`${table.tags} <@ ARRAY['communication','preparedness','actionable_advice','domain_expertise','follow_through','empathy','other']::text[]`),
  check("session_feedback_comment_length_ck", sql`${table.comment} IS NULL OR char_length(${table.comment}) <= 2000`),
]);
