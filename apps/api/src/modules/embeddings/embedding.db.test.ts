import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { pool } from "../../db/client";
import { touchEmbeddingIfCurrent } from "./embedding.repository";

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

test("touchEmbeddingIfCurrent refreshes a stale embedding only for the current profile version", async () => {
  const founderId = randomUUID();
  const mentorUserId = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  try {
    await pool.query(
      `INSERT INTO users(id, email, full_name, role, status, email_verified_at)
       VALUES ($1, $2, 'Touch Founder', 'founder', 'active', now()),
              ($3, $4, 'Touch Mentor', 'mentor', 'active', now())`,
      [founderId, `touch-founder-${suffix}@example.test`, mentorUserId, `touch-mentor-${suffix}@example.test`],
    );
    const startupRows = await pool.query<{ id: string; version: string }>(
      `INSERT INTO startups(founder_id, name, is_complete) VALUES ($1, 'Touch Startup', true)
       RETURNING id, updated_at::text AS version`,
      [founderId],
    );
    const startupId = startupRows.rows[0]!.id;
    await pool.query(`INSERT INTO mentor_profiles(user_id, is_complete) VALUES ($1, true)`, [mentorUserId]);
    const mentorVersion = (await pool.query<{ version: string }>(
      `SELECT updated_at::text AS version FROM mentor_profiles WHERE user_id = $1`, [mentorUserId],
    )).rows[0]!.version;
    const vectorLiteral = `[${Array.from({ length: 384 }, () => "0.5").join(",")}]`;
    await pool.query(
      `INSERT INTO profile_embeddings(startup_id, embedding, content_hash, updated_at)
       VALUES ($1, $2::vector, 'startup-hash', now() - interval '1 hour')`,
      [startupId, vectorLiteral],
    );
    await pool.query(
      `INSERT INTO profile_embeddings(mentor_id, embedding, content_hash, updated_at)
       VALUES ($1, $2::vector, 'mentor-hash', now() - interval '1 hour')`,
      [mentorUserId, vectorLiteral],
    );

    const mentorJob = { profileType: "mentor" as const, profileId: mentorUserId };
    const startupJob = { profileType: "startup" as const, profileId: startupId };
    assert.equal(await touchEmbeddingIfCurrent(mentorJob, mentorVersion), true);
    assert.equal(await touchEmbeddingIfCurrent(startupJob, startupRows.rows[0]!.version), true);
    const freshness = await pool.query<{ stale: number }>(
      `SELECT count(*)::int AS stale FROM profile_embeddings
       WHERE (startup_id = $1 OR mentor_id = $2) AND updated_at < now() - interval '1 minute'`,
      [startupId, mentorUserId],
    );
    assert.equal(freshness.rows[0]!.stale, 0);

    const touchedAt = (await pool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM profile_embeddings WHERE mentor_id = $1`, [mentorUserId],
    )).rows[0]!.updated_at;
    await pool.query(
      `UPDATE mentor_profiles SET bio = 'New bio', updated_at = now() + interval '1 second' WHERE user_id = $1`,
      [mentorUserId],
    );
    assert.equal(await touchEmbeddingIfCurrent(mentorJob, mentorVersion), false);
    const afterStaleTouch = (await pool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM profile_embeddings WHERE mentor_id = $1`, [mentorUserId],
    )).rows[0]!.updated_at;
    assert.equal(afterStaleTouch.getTime(), touchedAt.getTime());

    assert.equal(await touchEmbeddingIfCurrent({ profileType: "mentor", profileId: randomUUID() }, mentorVersion), false);
  } finally {
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[founderId, mentorUserId]]);
  }
});

after(async () => pool.end());
