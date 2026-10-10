import { sql } from "drizzle-orm";
import {
  check,
  customType,
  foreignKey,
  index,
  text,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { connections } from "./connections";
import { sessionStatusEnum } from "./enums";
import { users } from "./users";

const tstzrange = customType<{ data: string; driverData: string }>({
  dataType: () => "tstzrange",
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id").notNull(),
    mentorId: uuid("mentor_id").notNull(),
    startupId: uuid("startup_id").notNull(),
    timeRange: tstzrange("time_range").notNull(),
    status: sessionStatusEnum("status").notNull().default("scheduled"),
    bookingActorUserId: uuid("booking_actor_user_id").references(() => users.id, { onDelete: "set null" }),
    idempotencyKey: uuid("idempotency_key"),
    meetingUrl: text("meeting_url"),
    googleEventId: text("google_event_id"),
    calendarOwnerUserId: uuid("calendar_owner_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "sessions_connection_pair_fk",
      columns: [table.connectionId, table.startupId, table.mentorId],
      foreignColumns: [connections.id, connections.startupId, connections.mentorId],
    }).onDelete("cascade"),
    check(
      "sessions_nonempty_half_open_range_ck",
      sql`NOT isempty(${table.timeRange}) AND lower_inc(${table.timeRange}) AND NOT upper_inc(${table.timeRange}) AND NOT lower_inf(${table.timeRange}) AND NOT upper_inf(${table.timeRange})`,
    ),
    index("sessions_connection_status_idx").on(table.connectionId, table.status),
    index("sessions_participants_start_idx").on(table.startupId, table.mentorId),
    uniqueIndex("sessions_booking_idempotency_uidx").on(table.bookingActorUserId, table.idempotencyKey),
  ],
);

export const sessionEvents = pgTable(
  "session_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    fromStatus: sessionStatusEnum("from_status"),
    toStatus: sessionStatusEnum("to_status"),
    oldStartsAt: timestamp("old_starts_at", { withTimezone: true }),
    oldEndsAt: timestamp("old_ends_at", { withTimezone: true }),
    newStartsAt: timestamp("new_starts_at", { withTimezone: true }),
    newEndsAt: timestamp("new_ends_at", { withTimezone: true }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("session_events_type_ck", sql`${table.eventType} IN ('created', 'rescheduled', 'cancelled', 'completed', 'no_show', 'meeting_link_updated')`),
    index("session_events_session_created_idx").on(table.sessionId, table.createdAt),
  ],
);

export const googleCalendarAccounts = pgTable(
  "google_calendar_accounts",
  {
    userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
    calendarId: text("calendar_id").notNull().default("primary"),
    scopes: text("scopes").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);
