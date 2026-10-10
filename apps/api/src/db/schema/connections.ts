import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { connectionStateEnum } from "./enums";
import { mentorProfiles } from "./mentor-onboarding";
import { startups } from "./founder-onboarding";
import { users } from "./users";

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startupId: uuid("startup_id")
      .notNull()
      .references(() => startups.id, { onDelete: "cascade" }),
    mentorId: uuid("mentor_id")
      .notNull()
      .references(() => mentorProfiles.userId, { onDelete: "cascade" }),
    initiatedBy: uuid("initiated_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    state: connectionStateEnum("state").notNull(),
    introMessage: text("intro_message"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastDeclinedAt: timestamp("last_declined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "connections_pending_expiry_ck",
      sql`${table.state} NOT IN ('requested', 'invited') OR ${table.expiresAt} IS NOT NULL`,
    ),
    check(
      "connections_decline_timestamp_ck",
      sql`${table.state} <> 'declined' OR ${table.lastDeclinedAt} IS NOT NULL`,
    ),
    uniqueIndex("connections_pair_uidx").on(table.startupId, table.mentorId),
    uniqueIndex("connections_identity_pair_uidx").on(
      table.id,
      table.startupId,
      table.mentorId,
    ),
    index("connections_mentor_state_idx").on(table.mentorId, table.state),
    index("connections_startup_state_idx").on(table.startupId, table.state),
    index("connections_pair_declined_idx").on(
      table.startupId,
      table.mentorId,
      table.lastDeclinedAt,
    ),
  ],
);

/** Constant policy chosen for the first connection lifecycle implementation. */
export const CONNECTION_DECLINE_COOLDOWN_DAYS = 30;
export const CONNECTION_PENDING_EXPIRY_DAYS = 14;
