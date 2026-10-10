import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { matchCandidateTypeEnum, matchEventTypeEnum } from "./enums";
import { connections } from "./connections";
import { mentorProfiles } from "./mentor-onboarding";
import { startups } from "./founder-onboarding";
import { users } from "./users";

export const matchEvents = pgTable("match_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  candidateType: matchCandidateTypeEnum("candidate_type").notNull(),
  candidateMentorId: uuid("candidate_mentor_id").references(() => mentorProfiles.userId, { onDelete: "cascade" }),
  candidateStartupId: uuid("candidate_startup_id").references(() => startups.id, { onDelete: "cascade" }),
  eventType: matchEventTypeEnum("event_type").notNull(),
  dismissalReason: text("dismissal_reason"),
  connectionId: uuid("connection_id").references(() => connections.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("match_events_candidate_kind_ck", sql`(${table.candidateType} = 'mentor' AND ${table.candidateMentorId} IS NOT NULL AND ${table.candidateStartupId} IS NULL) OR (${table.candidateType} = 'startup' AND ${table.candidateStartupId} IS NOT NULL AND ${table.candidateMentorId} IS NULL)`),
  check("match_events_reason_ck", sql`(${table.eventType} = 'dismiss' AND (${table.dismissalReason} IS NULL OR char_length(${table.dismissalReason}) <= 500)) OR (${table.eventType} <> 'dismiss' AND ${table.dismissalReason} IS NULL)`),
  check("match_events_connection_ck", sql`(${table.eventType} = 'request' AND ${table.connectionId} IS NOT NULL) OR (${table.eventType} <> 'request' AND ${table.connectionId} IS NULL)`),
  index("match_events_actor_created_idx").on(table.actorUserId, table.createdAt),
  index("match_events_actor_type_created_idx").on(table.actorUserId, table.eventType, table.createdAt),
  index("match_events_mentor_candidate_idx").on(table.candidateMentorId, table.eventType, table.createdAt),
  index("match_events_startup_candidate_idx").on(table.candidateStartupId, table.eventType, table.createdAt),
  uniqueIndex("match_events_action_uidx").on(table.actorUserId, table.candidateType, table.candidateMentorId, table.candidateStartupId, table.eventType).where(sql`${table.eventType} IN ('save', 'dismiss')`),
]);
