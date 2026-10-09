import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["founder", "mentor", "admin"]);
export const userStatusEnum = pgEnum("user_status", [
  "active",
  "pending_approval",
  "rejected",
  "suspended",
]);