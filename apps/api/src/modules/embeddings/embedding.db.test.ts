import assert from "node:assert/strict";
import { after, test } from "node:test";
import { pool } from "../../db/client";

test("profile embedding migration creates a 384-dimensional vector and cosine HNSW index", async () => {
  const { rows } = await pool.query<{ data_type: string; udt_name: string; vector_type: string; indexdef: string | null }>(
    `SELECT c.data_type, c.udt_name, format_type(a.atttypid, a.atttypmod) AS vector_type,
       (SELECT indexdef FROM pg_indexes WHERE tablename = 'profile_embeddings' AND indexname = 'profile_embeddings_embedding_hnsw_idx') AS indexdef
     FROM information_schema.columns c
     JOIN pg_attribute a ON a.attrelid = 'profile_embeddings'::regclass AND a.attname = c.column_name
     WHERE c.table_schema = current_schema() AND c.table_name = 'profile_embeddings' AND c.column_name = 'embedding'`,
  );
  assert.equal(rows.length, 1, "profile_embeddings table/embedding column missing; apply database migrations");
  assert.equal(rows[0]?.udt_name, "vector");
  assert.equal(rows[0]?.vector_type, "vector(384)");
  assert.match(rows[0]?.indexdef ?? "", /USING hnsw \(embedding vector_cosine_ops\)/i);
  const hashColumn = await pool.query<{ is_nullable: string; column_default: string | null }>(
    "SELECT is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'profile_embeddings' AND column_name = 'content_hash'",
  );
  assert.equal(hashColumn.rows[0]?.is_nullable, "NO");
  const dimension = await pool.query<{ dimensions: number }>("SELECT vector_dims('[1,0]'::vector) AS dimensions");
  assert.equal(dimension.rows[0]?.dimensions, 2, "pgvector extension is unavailable");
  const constraint = await pool.query<{ present: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profile_embeddings_exactly_one_profile_ck') AS present",
  );
  assert.equal(constraint.rows[0]?.present, true);
});

after(async () => pool.end());
