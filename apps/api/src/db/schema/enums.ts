import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["founder", "mentor", "admin"]);
export const userStatusEnum = pgEnum("user_status", [
  "active",
  "pending_approval",
  "rejected",
  "suspended",
]);

export const connectionStateEnum = pgEnum("connection_state", [
  "requested",
  "invited",
  "accepted",
  "declined",
  "withdrawn",
  "expired",
]);

export const sessionStatusEnum = pgEnum("session_status", [
  "scheduled",
  "rescheduled",
  "cancelled",
  "completed",
  "no_show",
]);

export const matchCandidateTypeEnum = pgEnum("match_candidate_type", ["mentor", "startup"]);
export const matchEventTypeEnum = pgEnum("match_event_type", ["view", "save", "dismiss", "request"]);
