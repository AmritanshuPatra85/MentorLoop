import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid, vector } from "drizzle-orm/pg-core";
import { mentorProfiles } from "./mentor-onboarding";
import { startups } from "./founder-onboarding";

export const profileEmbeddings = pgTable(
  "profile_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startupId: uuid("startup_id").references(() => startups.id, { onDelete: "cascade" }),
    mentorId: uuid("mentor_id").references(() => mentorProfiles.userId, { onDelete: "cascade" }),
    embedding: vector("embedding", { dimensions: 384 }).notNull(),
    contentHash: text("content_hash").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("profile_embeddings_exactly_one_profile_ck", sql`num_nonnulls(${table.startupId}, ${table.mentorId}) = 1`),
    uniqueIndex("profile_embeddings_startup_uidx").on(table.startupId),
    uniqueIndex("profile_embeddings_mentor_uidx").on(table.mentorId),
    index("profile_embeddings_embedding_hnsw_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);
