import { check, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const matchExplanations = pgTable(
  "match_explanations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startupContentHash: text("startup_content_hash").notNull(),
    mentorContentHash: text("mentor_content_hash").notNull(),
    explanation: text("explanation").notNull(),
    source: text("source").$type<"groq" | "template">().notNull(),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("match_explanations_versions_uidx").on(table.startupContentHash, table.mentorContentHash),
    check("match_explanations_source_ck", sql`${table.source} IN ('groq', 'template')`),
  ],
);
