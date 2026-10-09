import { createHash } from "node:crypto";
import { eq, gt } from "drizzle-orm";
import { db, pool } from "../../db/client";
import { mentorProfiles, profileEmbeddings, startups } from "../../db/schema";
import { buildMentorEmbeddingText, buildStartupEmbeddingText } from "./profile-text";
import { normalizeEmbeddingInput } from "./embedding.service";
import type { EmbeddingJobData } from "./embedding.queue";

export type EmbeddingProfileSnapshot = { text: string; version: string };

export function hashEmbeddingText(text: string): string {
  return createHash("sha256").update(normalizeEmbeddingInput(text), "utf8").digest("hex");
}

export async function loadEmbeddingProfile(data: EmbeddingJobData): Promise<EmbeddingProfileSnapshot | null> {
  if (data.profileType === "startup") {
    const [row] = await pool.query<{
      id: string; name: string | null; one_liner: string | null; description: string | null;
      stage_name: string | null; help_needed: string | null; goals: string | null; version: string;
    }>(
      `SELECT s.id, s.name, s.one_liner, s.description, st.name AS stage_name, s.help_needed, s.goals,
              s.updated_at::text AS version
       FROM startups s LEFT JOIN stages st ON st.id = s.stage_id WHERE s.id = $1`,
      [data.profileId],
    ).then((result) => result.rows);
    if (!row) return null;
    const { rows: domainRows } = await pool.query<{ name: string }>(
      `SELECT d.name FROM startup_domains sd JOIN domains d ON d.id = sd.domain_id
       WHERE sd.startup_id = $1 ORDER BY sd.display_order, d.name`,
      [data.profileId],
    );
    return {
      version: row.version,
      text: buildStartupEmbeddingText({
        name: row.name, oneLiner: row.one_liner, description: row.description,
        domainNames: domainRows.map((domain) => domain.name), stageName: row.stage_name,
        helpNeeded: row.help_needed, goals: row.goals,
      }),
    };
  }

  const [row] = await pool.query<{
    user_id: string; current_role: string | null; organization: string | null; bio: string | null;
    experience_summary: string | null; years_experience: number | null; help_topics: string | null; version: string;
  }>(
    `SELECT m.user_id, m.current_role, m.organization, m.bio, m.experience_summary, m.years_experience,
            m.help_topics, m.updated_at::text AS version
     FROM mentor_profiles m WHERE m.user_id = $1`,
    [data.profileId],
  ).then((result) => result.rows);
  if (!row) return null;
  const [domainRows, skillRows, stageRows] = await Promise.all([
    pool.query<{ name: string }>(`SELECT d.name FROM mentor_domains md JOIN domains d ON d.id = md.domain_id WHERE md.mentor_id = $1 ORDER BY md.display_order, d.name`, [data.profileId]),
    pool.query<{ name: string }>(`SELECT s.name FROM mentor_skills ms JOIN skills s ON s.id = ms.skill_id WHERE ms.mentor_id = $1 ORDER BY ms.display_order, s.name`, [data.profileId]),
    pool.query<{ name: string }>(`SELECT s.name FROM mentor_stages ms JOIN stages s ON s.id = ms.stage_id WHERE ms.mentor_id = $1 ORDER BY ms.display_order, s.name`, [data.profileId]),
  ]);
  return {
    version: row.version,
    text: buildMentorEmbeddingText({
      currentRole: row.current_role, organization: row.organization, bio: row.bio,
      experienceSummary: row.experience_summary, yearsExperience: row.years_experience,
      domainNames: domainRows.rows.map((item) => item.name), skillNames: skillRows.rows.map((item) => item.name),
      mentorshipStageNames: stageRows.rows.map((item) => item.name), helpTopics: row.help_topics,
    }),
  };
}

export async function getStoredEmbedding(data: EmbeddingJobData) {
  const condition = data.profileType === "startup"
    ? eq(profileEmbeddings.startupId, data.profileId)
    : eq(profileEmbeddings.mentorId, data.profileId);
  const [row] = await db.select({ contentHash: profileEmbeddings.contentHash, embedding: profileEmbeddings.embedding })
    .from(profileEmbeddings).where(condition).limit(1);
  return row ?? null;
}

export async function storeEmbeddingIfCurrent(
  data: EmbeddingJobData, version: string, contentHash: string, embedding: number[],
): Promise<boolean> {
  return pool.connect().then(async (client) => {
    try {
      await client.query("BEGIN");
      const table = data.profileType === "startup" ? "startups" : "mentor_profiles";
      const key = data.profileType === "startup" ? "id" : "user_id";
      const { rows } = await client.query<{ version: string }>(
        `SELECT updated_at::text AS version FROM ${table} WHERE ${key} = $1 FOR SHARE`,
        [data.profileId],
      );
      if (!rows[0] || rows[0].version !== version) {
        await client.query("ROLLBACK");
        return false;
      }
      const startupId = data.profileType === "startup" ? data.profileId : null;
      const mentorId = data.profileType === "mentor" ? data.profileId : null;
      await client.query(
        `INSERT INTO profile_embeddings (startup_id, mentor_id, embedding, content_hash, created_at, updated_at)
         VALUES ($1, $2, $3::vector, $4, now(), now())
         ON CONFLICT (${data.profileType === "startup" ? "startup_id" : "mentor_id"})
         DO UPDATE SET embedding = EXCLUDED.embedding, content_hash = EXCLUDED.content_hash, updated_at = now()`,
        [startupId, mentorId, `[${embedding.join(",")}]`, contentHash],
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function deleteEmbeddingIfCurrent(data: EmbeddingJobData, version: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const table = data.profileType === "startup" ? "startups" : "mentor_profiles";
    const key = data.profileType === "startup" ? "id" : "user_id";
    const { rows } = await client.query<{ version: string }>(
      `SELECT updated_at::text AS version FROM ${table} WHERE ${key} = $1 FOR SHARE`,
      [data.profileId],
    );
    if (!rows[0] || rows[0].version !== version) {
      await client.query("ROLLBACK");
      return false;
    }
    const column = data.profileType === "startup" ? "startup_id" : "mentor_id";
    await client.query(`DELETE FROM profile_embeddings WHERE ${column} = $1`, [data.profileId]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getEmbeddingProfileIds(profileType: EmbeddingJobData["profileType"], after: string | null, limit: number): Promise<string[]> {
  if (profileType === "startup") {
    const rows = await db.select({ id: startups.id }).from(startups)
      .where(after ? gt(startups.id, after) : undefined)
      .orderBy(startups.id).limit(limit);
    return rows.map((row) => row.id);
  }
  const rows = await db.select({ id: mentorProfiles.userId }).from(mentorProfiles)
    .where(after ? gt(mentorProfiles.userId, after) : undefined)
    .orderBy(mentorProfiles.userId).limit(limit);
  return rows.map((row) => row.id);
}

export async function isStoredEmbeddingCurrent(data: EmbeddingJobData, contentHash: string): Promise<boolean> {
  const row = await getStoredEmbedding(data);
  return row?.contentHash === contentHash && row.embedding.length === 384 && row.embedding.every(Number.isFinite);
}
