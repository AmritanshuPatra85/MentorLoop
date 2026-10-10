import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, date } from "drizzle-orm/pg-core";
import { sessions } from "./sessions";
import { users } from "./users";

export const sessionActionItems = pgTable("session_action_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  submissionId: uuid("submission_id").notNull(),
  submissionIndex: integer("submission_index").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  owner: text("owner").notNull(),
  dueDate: date("due_date"),
  priority: text("priority").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("session_action_items_title_ck", sql`length(btrim(${table.title})) BETWEEN 1 AND 160`),
  check("session_action_items_description_ck", sql`${table.description} IS NULL OR length(${table.description}) <= 2000`),
  check("session_action_items_owner_ck", sql`${table.owner} IN ('founder','mentor','shared','unassigned')`),
  check("session_action_items_priority_ck", sql`${table.priority} IN ('low','medium','high')`),
  check("session_action_items_status_ck", sql`${table.status} IN ('open','in_progress','done','blocked')`),
  check("session_action_items_submission_index_ck", sql`${table.submissionIndex} BETWEEN 0 AND 19`),
  uniqueIndex("session_action_items_submission_uidx").on(table.createdBy, table.submissionId, table.submissionIndex),
  index("session_action_items_session_created_idx").on(table.sessionId, table.createdAt),
]);

export type SessionActionItemRow = typeof sessionActionItems.$inferSelect;
export type NewSessionActionItem = typeof sessionActionItems.$inferInsert;
