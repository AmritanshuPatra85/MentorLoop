import { pool } from "../../../db/client";
import type { MatchResult } from "@mentorloop/shared";
import type { MatchExplanationCacheRow, MatchExplanationFacts, MatchExplanationJobData } from "./explanation.types";

export type MatchExplanationInput = {
  startupId: string;
  mentorId: string;
  startupContentHash: string | null;
  mentorContentHash: string | null;
  facts: MatchExplanationFacts;
  signals: MatchResult["signals"];
};

export async function loadMatchExplanationInputs(founderUserId: string, ranked: MatchResult[]): Promise<MatchExplanationInput[]> {
  if (!ranked.length) return [];
  const { rows } = await pool.query<{
    startup_id: string; mentor_id: string; startup_hash: string | null; mentor_hash: string | null;
    mentor_name: string; current_role: string | null; organization: string | null; years_experience: number | null;
    overlapping_domains: string[] | null; startup_stages: string[] | null; mentor_stages: string[] | null;
    has_availability_preferences: boolean;
  }>(
    `SELECT startup.id AS startup_id, mentor.user_id AS mentor_id,
       startup_embedding.content_hash AS startup_hash, mentor_embedding.content_hash AS mentor_hash,
       person.full_name AS mentor_name, mentor.current_role, mentor.organization, mentor.years_experience,
       COALESCE((SELECT array_agg(domain.name ORDER BY domain.name)
         FROM startup_domains sd JOIN mentor_domains md ON md.domain_id=sd.domain_id
         JOIN domains domain ON domain.id=sd.domain_id WHERE sd.startup_id=startup.id AND md.mentor_id=mentor.user_id), '{}') AS overlapping_domains,
       COALESCE((SELECT array_agg(stage.name ORDER BY stage.display_order)
         FROM stages stage WHERE stage.id=startup.stage_id), '{}') AS startup_stages,
       COALESCE((SELECT array_agg(stage.name ORDER BY stage.display_order)
         FROM mentor_stages ms JOIN stages stage ON stage.id=ms.stage_id WHERE ms.mentor_id=mentor.user_id), '{}') AS mentor_stages,
       jsonb_array_length(startup.preferred_session_times)>0 AS has_availability_preferences
     FROM startups startup
     JOIN profile_embeddings startup_embedding ON startup_embedding.startup_id=startup.id
       AND startup_embedding.content_hash<>'' AND startup_embedding.updated_at>=startup.updated_at
     CROSS JOIN unnest($2::uuid[]) requested(mentor_id)
     JOIN mentor_profiles mentor ON mentor.user_id=requested.mentor_id
     JOIN users person ON person.id=mentor.user_id
     LEFT JOIN profile_embeddings mentor_embedding ON mentor_embedding.mentor_id=mentor.user_id
       AND mentor_embedding.content_hash<>'' AND mentor_embedding.updated_at>=mentor.updated_at
     WHERE startup.founder_id=$1`,
    [founderUserId, ranked.map((match) => match.candidateId)],
  );
  const rankedByMentor = new Map(ranked.map((item) => [item.candidateId, item]));
  return rows.map((row) => ({
    startupId: row.startup_id,
    mentorId: row.mentor_id,
    startupContentHash: row.startup_hash,
    mentorContentHash: row.mentor_hash,
    facts: {
      mentorName: row.mentor_name,
      currentRole: row.current_role,
      organization: row.organization,
      yearsExperience: row.years_experience,
      overlappingDomains: row.overlapping_domains ?? [],
      startupStages: row.startup_stages ?? [],
      mentorStages: row.mentor_stages ?? [],
      hasAvailabilityPreferences: row.has_availability_preferences,
    },
    signals: rankedByMentor.get(row.mentor_id)!.signals,
  }));
}

export function explanationPairKey(startupHash: string, mentorHash: string) {
  return `${startupHash}:${mentorHash}`;
}

export async function readMatchExplanationCache(inputs: MatchExplanationInput[]): Promise<Map<string, MatchExplanationCacheRow>> {
  const keyed = inputs.filter((item): item is MatchExplanationInput & { startupContentHash: string; mentorContentHash: string } =>
    !!item.startupContentHash && !!item.mentorContentHash);
  if (!keyed.length) return new Map();
  const { rows } = await pool.query<{
    startup_content_hash: string; mentor_content_hash: string; explanation: string; source: "groq" | "template"; model: string | null;
  }>(
    `SELECT cached.startup_content_hash,cached.mentor_content_hash,cached.explanation,cached.source,cached.model
     FROM match_explanations cached
     JOIN unnest($1::text[],$2::text[]) AS requested(startup_hash,mentor_hash)
       ON requested.startup_hash=cached.startup_content_hash AND requested.mentor_hash=cached.mentor_content_hash`,
    [keyed.map((item) => item.startupContentHash), keyed.map((item) => item.mentorContentHash)],
  );
  return new Map(rows.map((row) => [explanationPairKey(row.startup_content_hash, row.mentor_content_hash), {
    explanation: row.explanation, source: row.source, model: row.model,
  }]));
}

export async function isMatchExplanationVersionCurrent(job: MatchExplanationJobData): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1
     FROM startups startup JOIN profile_embeddings startup_embedding ON startup_embedding.startup_id=startup.id
     JOIN mentor_profiles mentor ON mentor.user_id=$2 JOIN profile_embeddings mentor_embedding ON mentor_embedding.mentor_id=mentor.user_id
     WHERE startup.id=$1 AND startup_embedding.content_hash=$3 AND mentor_embedding.content_hash=$4
       AND startup_embedding.updated_at>=startup.updated_at AND mentor_embedding.updated_at>=mentor.updated_at`,
    [job.startupId, job.mentorId, job.startupContentHash, job.mentorContentHash],
  );
  return rows.length > 0;
}

export async function upsertMatchExplanation(
  job: MatchExplanationJobData,
  explanation: string,
  source: "groq" | "template",
  model: string | null,
): Promise<boolean> {
  const { rows } = await pool.query(
    `INSERT INTO match_explanations (startup_content_hash,mentor_content_hash,explanation,source,model,created_at)
     SELECT $3,$4,$5,$6,$7,now()
     WHERE EXISTS (
       SELECT 1 FROM startups startup JOIN profile_embeddings se ON se.startup_id=startup.id
       JOIN mentor_profiles mentor ON mentor.user_id=$2 JOIN profile_embeddings me ON me.mentor_id=mentor.user_id
       WHERE startup.id=$1 AND se.content_hash=$3 AND me.content_hash=$4
         AND se.updated_at>=startup.updated_at AND me.updated_at>=mentor.updated_at
     )
     ON CONFLICT (startup_content_hash,mentor_content_hash) DO UPDATE
       SET explanation=EXCLUDED.explanation,source=EXCLUDED.source,model=EXCLUDED.model,created_at=now()
       WHERE match_explanations.source='template'
     RETURNING id`,
    [job.startupId, job.mentorId, job.startupContentHash, job.mentorContentHash, explanation, source, model],
  );
  return rows.length > 0;
}

export async function seedMatchExplanationTemplate(job: MatchExplanationJobData, explanation: string): Promise<void> {
  await pool.query(
    `INSERT INTO match_explanations (startup_content_hash,mentor_content_hash,explanation,source,model,created_at)
     SELECT $3,$4,$5,'template',NULL,now()
     WHERE EXISTS (
       SELECT 1 FROM startups startup JOIN profile_embeddings se ON se.startup_id=startup.id
       JOIN mentor_profiles mentor ON mentor.user_id=$2 JOIN profile_embeddings me ON me.mentor_id=mentor.user_id
       WHERE startup.id=$1 AND se.content_hash=$3 AND me.content_hash=$4
         AND se.updated_at>=startup.updated_at AND me.updated_at>=mentor.updated_at
     )
     ON CONFLICT (startup_content_hash,mentor_content_hash) DO NOTHING`,
    [job.startupId, job.mentorId, job.startupContentHash, job.mentorContentHash, explanation],
  );
}

export type MatchExplanationJob = MatchExplanationJobData;
