import { pool } from "../../db/client";
import { listEligibleMentorIds, listEligibleStartupIds } from "./eligibility.service";
import { matchingWeightsSchema, type MatchingWeights, type MatchResult } from "@mentorloop/shared";
import { trackRecordFromRating } from "./track-record";

type Direction = "mentor" | "startup";
type Retrieved = { candidateId: string; cosineDistance: number };
const DEFAULT_NEW_MENTOR_DAYS = 90;
const NEW_MENTOR_BOOST = 0.03;

async function sourceEmbedding(direction: Direction, sourceUserId: string) {
  const column = direction === "mentor" ? "startup_id" : "mentor_id";
  const table = direction === "mentor" ? "startups" : "mentor_profiles";
  const key = direction === "mentor" ? "founder_id" : "user_id";
  const { rows } = await pool.query<{ profile_id: string; embedding: string }>(
    `SELECT e.${direction === "mentor" ? "startup_id" : "mentor_id"} AS profile_id, e.embedding::text AS embedding
     FROM ${table} p JOIN profile_embeddings e ON e.${column} = p.${direction === "mentor" ? "id" : "user_id"}
     WHERE p.${key} = $1 AND e.content_hash <> '' AND e.updated_at >= p.updated_at LIMIT 1`, [sourceUserId]);
  return rows[0] ?? null;
}

/** Sprint 4.2: eligibility is computed first, then the shared 384d HNSW index retrieves the nearest eligible profiles. */
export async function retrieveCandidates(direction: Direction, sourceUserId: string): Promise<Retrieved[]> {
  const source = await sourceEmbedding(direction, sourceUserId);
  if (!source) return [];
  const eligible = direction === "mentor"
    ? await listEligibleMentorIds(sourceUserId)
    : await listEligibleStartupIds(sourceUserId);
  if (!eligible.length) return [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // pgvector 0.8+ continues the ANN scan after SQL filtering, so this returns 50 eligible rows where they exist.
    await client.query("SET LOCAL hnsw.ef_search = 200");
    await client.query("SET LOCAL hnsw.iterative_scan = 'strict_order'");
    const profileColumn = direction === "mentor" ? "mentor_id" : "startup_id";
    const { rows } = await client.query<{ candidate_id: string; distance: number }>(
      `SELECT ${profileColumn} AS candidate_id, embedding <=> $1::vector AS distance
       FROM profile_embeddings
       WHERE ${profileColumn} = ANY($2::uuid[]) AND content_hash <> ''
         AND updated_at >= (SELECT p.updated_at FROM ${direction === "mentor" ? "mentor_profiles" : "startups"} p WHERE p.${direction === "mentor" ? "user_id" : "id"}=profile_embeddings.${profileColumn})
       ORDER BY embedding <=> $1::vector, ${profileColumn}
       LIMIT 50`, [source.embedding, eligible]);
    await client.query("COMMIT");
    return rows.map((row) => ({ candidateId: row.candidate_id, cosineDistance: Number(row.distance) }));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function getMatchingWeights(): Promise<MatchingWeights> {
  const { rows } = await pool.query<{ value: unknown }>("SELECT value FROM platform_settings WHERE key = 'matching.weights'");
  if (!rows[0]) throw new Error("Matching weights are not configured");
  const parsed = matchingWeightsSchema.safeParse(rows[0].value);
  if (!parsed.success) throw new Error("Configured matching weights are invalid");
  return parsed.data;
}

export async function setMatchingWeights(weights: MatchingWeights, adminId: string): Promise<MatchingWeights> {
  const validated = matchingWeightsSchema.parse(weights);
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at, updated_by) VALUES ('matching.weights', $1::jsonb, now(), $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [JSON.stringify(validated), adminId]);
  return validated;
}

type ProfileData = {
  candidate_id: string; created_at: Date; domains: { id: string; primary: boolean }[];
  stages: { id: string; ord: number }[]; source_domains: { id: string; primary: boolean }[];
  source_stages: { id: string; ord: number }[];
};

function clamp(value: number) { return Math.max(0, Math.min(1, value)); }
function domainScore(source: ProfileData["source_domains"], candidate: ProfileData["domains"]) {
  const sourceWeights = new Map(source.map((d) => [d.id, d.primary ? 2 : 1]));
  const candidateWeights = new Map(candidate.map((d) => [d.id, d.primary ? 2 : 1]));
  const all = new Set([...sourceWeights.keys(), ...candidateWeights.keys()]);
  let intersection = 0; let union = 0;
  for (const id of all) { const left = sourceWeights.get(id) ?? 0; const right = candidateWeights.get(id) ?? 0; intersection += Math.min(left, right); union += Math.max(left, right); }
  return union ? intersection / union : 0;
}
function stageScore(source: ProfileData["source_stages"], candidate: ProfileData["stages"]) {
  let score = 0;
  for (const left of source) for (const right of candidate) {
    score = Math.max(score, left.ord === right.ord ? 1 : Math.abs(left.ord - right.ord) === 1 ? 0.5 : 0);
  }
  return score;
}

async function profileData(direction: Direction, sourceUserId: string, candidateIds: string[]): Promise<ProfileData[]> {
  if (!candidateIds.length) return [];
  const founderToMentor = direction === "mentor";
  const sql = founderToMentor
    ? `SELECT m.user_id AS candidate_id,u.created_at,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id',md.domain_id,'primary',false)) FROM mentor_domains md WHERE md.mentor_id=m.user_id),'[]') domains,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id',stg.id,'ord',stg.display_order)) FROM mentor_stages ms JOIN stages stg ON stg.id=ms.stage_id WHERE ms.mentor_id=m.user_id),'[]') stages,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id',sd.domain_id,'primary',sd.is_primary)) FROM startup_domains sd WHERE sd.startup_id=s.id),'[]') source_domains,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id',stg.id,'ord',stg.display_order)) FROM stages stg WHERE stg.id=s.stage_id),'[]') source_stages
       FROM mentor_profiles m JOIN users u ON u.id=m.user_id JOIN startups s ON s.founder_id=$1 WHERE m.user_id=ANY($2::uuid[])`
    : `SELECT s.id AS candidate_id,u.created_at,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id',sd.domain_id,'primary',sd.is_primary)) FROM startup_domains sd WHERE sd.startup_id=s.id),'[]') domains,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id',stg.id,'ord',stg.display_order)) FROM stages stg WHERE stg.id=s.stage_id),'[]') stages,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id',md.domain_id,'primary',false)) FROM mentor_domains md WHERE md.mentor_id=$1),'[]') source_domains,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id',stg.id,'ord',stg.display_order)) FROM mentor_stages ms JOIN stages stg ON stg.id=ms.stage_id WHERE ms.mentor_id=$1),'[]') source_stages
       FROM startups s JOIN users u ON u.id=s.founder_id WHERE s.id=ANY($2::uuid[])`;
  const { rows } = await pool.query<ProfileData>(sql, [sourceUserId, candidateIds]);
  return rows;
}

async function availabilityScores(direction: Direction, sourceUserId: string, candidateIds: string[]) {
  const { rows } = await pool.query<{ candidate_id: string; score: number | null }>(
    `WITH pairs AS (
       SELECT ids.candidate_id, s.id AS startup_id, ids.candidate_id AS mentor_id
       FROM startups s CROSS JOIN unnest($2::uuid[]) ids(candidate_id) WHERE s.founder_id=$1 AND $3='mentor'
       UNION ALL
       SELECT s.id, s.id, m.user_id FROM startups s CROSS JOIN mentor_profiles m
       WHERE s.id=ANY($2::uuid[]) AND m.user_id=$1 AND $3='startup'
     ), prefs AS (
       SELECT p.candidate_id, s.timezone AS founder_tz, pwin.value AS pref
       FROM pairs p JOIN startups s ON s.id=p.startup_id
       CROSS JOIN LATERAL jsonb_array_elements(s.preferred_session_times) pwin(value)
     ), pref_ranges AS (
       SELECT p.candidate_id, tstzrange(greatest((day.value::date + (p.pref->>'start')::time) AT TIME ZONE p.founder_tz,now()),
          least((day.value::date + (p.pref->>'end')::time) AT TIME ZONE p.founder_tz,now()+interval '14 days'),'[)') AS desired
       FROM prefs p CROSS JOIN LATERAL generate_series(date_trunc('day',now() AT TIME ZONE p.founder_tz),
          date_trunc('day',(now()+interval '14 days') AT TIME ZONE p.founder_tz),interval '1 day') day(value)
       WHERE extract(dow FROM day.value)::int=(p.pref->>'day')::int
     ), pref_totals AS (
       SELECT candidate_id,sum(extract(epoch FROM upper(desired)-lower(desired))) total FROM pref_ranges GROUP BY candidate_id
     ), actual AS (
       SELECT p.candidate_id,m.user_id AS mentor_id,m.timezone,m.session_length_minutes,m.buffer_minutes,m.minimum_notice_minutes,rule.day_of_week,rule.start_time,rule.end_time
       FROM pairs p JOIN mentor_profiles m ON m.user_id=p.mentor_id JOIN availability_rules rule ON rule.mentor_id=m.user_id
     ), actual_ranges AS (
       SELECT a.candidate_id,tstzrange((day.value::date+a.start_time) AT TIME ZONE a.timezone,(day.value::date+a.end_time) AT TIME ZONE a.timezone,'[)') r,
         a.mentor_id,a.session_length_minutes,a.buffer_minutes,a.minimum_notice_minutes
       FROM actual a CROSS JOIN LATERAL generate_series(date_trunc('day',now() AT TIME ZONE a.timezone),date_trunc('day',(now()+interval '14 days') AT TIME ZONE a.timezone),interval '1 day') day(value)
       WHERE extract(dow FROM day.value)::int=a.day_of_week
     ), free AS (
       SELECT a.candidate_id,f.r
       FROM actual_ranges a CROSS JOIN LATERAL unnest(
         tstzmultirange(tstzrange(greatest(lower(a.r),now()+a.minimum_notice_minutes*interval '1 minute'),least(upper(a.r),now()+interval '14 days'),'[)'))
         - coalesce((SELECT range_agg(tstzrange(x.starts_at,x.ends_at,'[)')) FROM availability_exceptions x WHERE x.mentor_id=a.mentor_id AND x.starts_at<upper(a.r) AND x.ends_at>lower(a.r)),'{}'::tstzmultirange)
         - coalesce((SELECT range_agg(tstzrange(lower(b.time_range)-a.buffer_minutes*interval '1 minute',upper(b.time_range)+a.buffer_minutes*interval '1 minute','[)')) FROM sessions b WHERE b.mentor_id=a.mentor_id AND b.status IN ('scheduled','rescheduled') AND b.time_range && a.r),'{}'::tstzmultirange)
       ) f(r) WHERE upper(f.r)-lower(f.r)>=a.session_length_minutes*interval '1 minute'
     ), overlap_totals AS (
       SELECT wanted.candidate_id,sum(extract(epoch FROM least(upper(wanted.desired),upper(f.r))-greatest(lower(wanted.desired),lower(f.r)))) matched
       FROM pref_ranges wanted JOIN free f ON f.candidate_id=wanted.candidate_id AND wanted.desired && f.r GROUP BY wanted.candidate_id
     )
     SELECT p.candidate_id, CASE WHEN t.total>0 THEN least(1,coalesce(o.matched,0)/t.total) ELSE 0.5 END score
     FROM pairs p LEFT JOIN pref_totals t USING(candidate_id) LEFT JOIN overlap_totals o USING(candidate_id)`,
    [sourceUserId, candidateIds, direction]);
  return new Map(rows.map((row) => [row.candidate_id, row.score == null ? 0.5 : Number(row.score)]));
}

export async function rankCandidates(direction: Direction, sourceUserId: string): Promise<MatchResult[]> {
  const retrieved = await retrieveCandidates(direction, sourceUserId);
  if (!retrieved.length) return [];
  const data = await profileData(direction, sourceUserId, retrieved.map((item) => item.candidateId));
  const availability = await availabilityScores(direction, sourceUserId, retrieved.map((item) => item.candidateId));
  const ratings = direction === "mentor" ? await pool.query<{mentor_id:string;average_rating:string;rating_count:string}>(
    `SELECT f.rated_mentor_id mentor_id,avg(f.rating)::text average_rating,count(*)::text rating_count
     FROM session_feedback f JOIN sessions s ON s.id=f.session_id AND s.status='completed'
     WHERE f.rated_mentor_id=ANY($1::uuid[]) GROUP BY f.rated_mentor_id`, [retrieved.map((item)=>item.candidateId)]) : { rows: [] as {mentor_id:string;average_rating:string;rating_count:string}[] };
  const trackById = new Map(ratings.rows.map((r)=>[r.mentor_id,trackRecordFromRating(Number(r.average_rating),Number(r.rating_count))]));
  const weights = await getMatchingWeights();
  const byId = new Map(data.map((item) => [item.candidate_id, item]));
  const ranked = retrieved.flatMap((item) => {
    const profile = byId.get(item.candidateId); if (!profile) return [];
    const raw = {
      semanticSimilarity: clamp(1 - item.cosineDistance / 2),
      domainOverlap: domainScore(profile.source_domains ?? [], profile.domains ?? []),
      stageFit: stageScore(profile.source_stages ?? [], profile.stages ?? []),
      availabilityOverlap: availability.get(profile.candidate_id) ?? 0.5,
      trackRecord: direction === "mentor" ? (trackById.get(profile.candidate_id) ?? 0.5) : 0.5,
    };
    const signals = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, { raw: value, weight: weights[key as keyof MatchingWeights], weighted: value * weights[key as keyof MatchingWeights] / 100 }])) as MatchResult["signals"];
    const boost = direction === "mentor" && Date.now() - new Date(profile.created_at).getTime() <= DEFAULT_NEW_MENTOR_DAYS * 86_400_000 ? NEW_MENTOR_BOOST : 0;
    const score = clamp(Object.values(signals).reduce((sum, signal) => sum + signal.weighted, 0) + boost);
    return [{ candidateId: item.candidateId, score, signals, newMentorBoost: boost, semanticRaw: raw.semanticSimilarity }];
  });
  return ranked.sort((a, b) => b.score - a.score || b.semanticRaw - a.semanticRaw || (a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0)
    ).slice(0, 50).map(({ semanticRaw: _semanticRaw, ...result }) => result);
}
