import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { mentorProfiles } from "./mentor-onboarding";

export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mentorId: uuid("mentor_id")
      .notNull()
      .references(() => mentorProfiles.userId, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("availability_rules_day_ck", sql`${table.dayOfWeek} between 0 and 6`),
    check(
      "availability_rules_positive_window_ck",
      sql`${table.startTime} < ${table.endTime}`,
    ),
    uniqueIndex("availability_rules_window_uidx").on(
      table.mentorId,
      table.dayOfWeek,
      table.startTime,
      table.endTime,
    ),
    index("availability_rules_mentor_day_idx").on(table.mentorId, table.dayOfWeek),
  ],
);

/** Date-specific closures are absolute instants; recurring rules remain in mentor local time. */
export const availabilityExceptions = pgTable(
  "availability_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mentorId: uuid("mentor_id")
      .notNull()
      .references(() => mentorProfiles.userId, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "availability_exceptions_positive_window_ck",
      sql`${table.startsAt} < ${table.endsAt}`,
    ),
    index("availability_exceptions_mentor_start_idx").on(table.mentorId, table.startsAt),
  ],
);
