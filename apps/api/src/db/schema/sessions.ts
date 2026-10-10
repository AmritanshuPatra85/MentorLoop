import { sql } from "drizzle-orm";
import {
  check,
  customType,
  foreignKey,
  index,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { connections } from "./connections";
import { sessionStatusEnum } from "./enums";

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
  ],
);
