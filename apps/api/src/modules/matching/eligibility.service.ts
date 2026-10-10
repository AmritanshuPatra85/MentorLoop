import { pool } from "../../db/client";
import { CONNECTION_DECLINE_COOLDOWN_DAYS } from "../../db/schema/connections";

export type EligibleCandidateIds = string[];

/**
 * True when one recurring mentor window remains long enough for a real session
 * after notice, closures, booked sessions, and the mentor's buffer are applied.
 * Weekly windows are local wall-clock times interpreted in mentor_profiles.timezone.
 */
const HAS_BOOKABLE_WINDOW = `
  EXISTS (
    SELECT 1
    FROM availability_rules rule
    CROSS JOIN LATERAL generate_series(
      date_trunc('day', statement_timestamp() AT TIME ZONE mentor_profile.timezone),
      date_trunc('day', (statement_timestamp() + interval '14 days') AT TIME ZONE mentor_profile.timezone),
      interval '1 day'
    ) AS local_day(value)
    CROSS JOIN LATERAL (
      SELECT tstzrange(
        (local_day.value::date + rule.start_time) AT TIME ZONE mentor_profile.timezone,
        (local_day.value::date + rule.end_time) AT TIME ZONE mentor_profile.timezone,
        '[)'
      ) AS recurring_window
    ) AS recurring
    CROSS JOIN LATERAL (
      SELECT tstzrange(
        GREATEST(lower(recurring.recurring_window), statement_timestamp() + mentor_profile.minimum_notice_minutes * interval '1 minute'),
        LEAST(upper(recurring.recurring_window), statement_timestamp() + interval '14 days'),
        '[)'
      ) AS bounded_window
    ) AS bounded
    WHERE rule.mentor_id = mentor_profile.user_id
      AND extract(dow FROM local_day.value)::integer = rule.day_of_week
      AND upper(bounded.bounded_window) > lower(bounded.bounded_window)
      AND EXISTS (
        SELECT 1
        FROM unnest(
          tstzmultirange(bounded.bounded_window)
          - COALESCE((
              SELECT range_agg(tstzrange(closure.starts_at, closure.ends_at, '[)'))
              FROM availability_exceptions closure
              WHERE closure.mentor_id = mentor_profile.user_id
                AND closure.starts_at < upper(bounded.bounded_window)
                AND closure.ends_at > lower(bounded.bounded_window)
            ), '{}'::tstzmultirange)
          - COALESCE((
              SELECT range_agg(tstzrange(
                lower(booking.time_range) - mentor_profile.buffer_minutes * interval '1 minute',
                upper(booking.time_range) + mentor_profile.buffer_minutes * interval '1 minute',
                '[)'
              ))
              FROM sessions booking
              WHERE booking.mentor_id = mentor_profile.user_id
                AND booking.status IN ('scheduled', 'rescheduled')
                AND tstzrange(
                  lower(booking.time_range) - mentor_profile.buffer_minutes * interval '1 minute',
                  upper(booking.time_range) + mentor_profile.buffer_minutes * interval '1 minute',
                  '[)'
                ) && bounded.bounded_window
            ), '{}'::tstzmultirange)
        ) AS free_window(value)
        WHERE upper(free_window.value) - lower(free_window.value)
          >= mentor_profile.session_length_minutes * interval '1 minute'
      )
  )`;

/** Eligible mentor IDs for an authenticated founder's own startup. */
export async function listEligibleMentorIds(
  founderUserId: string,
): Promise<EligibleCandidateIds> {
  const result = await pool.query<{ candidate_id: string }>(
    `WITH source_startup AS (
       SELECT startup.id, founder.id AS founder_user_id
       FROM users founder
       JOIN startups startup ON startup.founder_id = founder.id
       WHERE founder.id = $1
         AND founder.role = 'founder'
         AND founder.status = 'active'
         AND founder.email_verified_at IS NOT NULL
         AND startup.is_complete = true
     )
     SELECT mentor_profile.user_id AS candidate_id
     FROM source_startup source
     JOIN users mentor ON mentor.role = 'mentor'
       AND mentor.status = 'active'
       AND mentor.email_verified_at IS NOT NULL
     JOIN mentor_profiles mentor_profile ON mentor_profile.user_id = mentor.id
     JOIN pg_timezone_names timezone ON timezone.name = mentor_profile.timezone
     WHERE mentor_profile.is_complete = true
       AND mentor_profile.max_mentees IS NOT NULL
       AND mentor_profile.max_mentees > 0
       AND mentor_profile.session_length_minutes IS NOT NULL
       AND mentor_profile.session_length_minutes > 0
       AND (SELECT count(*) FROM connections active_connection
            WHERE active_connection.mentor_id = mentor.id AND active_connection.state = 'accepted')
           < mentor_profile.max_mentees
       AND NOT EXISTS (
         SELECT 1 FROM connections pair
         WHERE pair.startup_id = source.id AND pair.mentor_id = mentor.id
           AND (
             pair.state = 'accepted'
             OR (pair.state IN ('requested', 'invited') AND pair.expires_at > statement_timestamp())
             OR pair.last_declined_at > statement_timestamp() - ($2 * interval '1 day')
           )
       )
       AND NOT EXISTS (
         SELECT 1 FROM match_events dismissal
         WHERE dismissal.actor_user_id=source.founder_user_id
           AND dismissal.candidate_type='mentor' AND dismissal.candidate_mentor_id=mentor.id
           AND dismissal.event_type='dismiss'
       )
       AND ${HAS_BOOKABLE_WINDOW}
     ORDER BY mentor_profile.user_id`,
    [founderUserId, CONNECTION_DECLINE_COOLDOWN_DAYS],
  );
  return result.rows.map((row) => row.candidate_id);
}

/** Eligible startup IDs for an authenticated, approved mentor with remaining capacity and bookable time. */
export async function listEligibleStartupIds(
  mentorUserId: string,
): Promise<EligibleCandidateIds> {
  const result = await pool.query<{ candidate_id: string }>(
    `WITH source_mentor AS (
       SELECT mentor_profile.user_id
       FROM users mentor
       JOIN mentor_profiles mentor_profile ON mentor_profile.user_id = mentor.id
       JOIN pg_timezone_names timezone ON timezone.name = mentor_profile.timezone
       WHERE mentor.id = $1
         AND mentor.role = 'mentor'
         AND mentor.status = 'active'
         AND mentor.email_verified_at IS NOT NULL
         AND mentor_profile.is_complete = true
         AND mentor_profile.max_mentees IS NOT NULL
         AND mentor_profile.max_mentees > 0
         AND mentor_profile.session_length_minutes IS NOT NULL
         AND mentor_profile.session_length_minutes > 0
         AND (SELECT count(*) FROM connections active_connection
              WHERE active_connection.mentor_id = mentor.id AND active_connection.state = 'accepted')
             < mentor_profile.max_mentees
         AND ${HAS_BOOKABLE_WINDOW}
     )
     SELECT startup.id AS candidate_id
     FROM source_mentor source
     JOIN users founder ON founder.role = 'founder'
       AND founder.status = 'active'
       AND founder.email_verified_at IS NOT NULL
     JOIN startups startup ON startup.founder_id = founder.id AND startup.is_complete = true
     WHERE NOT EXISTS (
       SELECT 1 FROM connections pair
       WHERE pair.startup_id = startup.id AND pair.mentor_id = source.user_id
         AND (
           pair.state = 'accepted'
           OR (pair.state IN ('requested', 'invited') AND pair.expires_at > statement_timestamp())
           OR pair.last_declined_at > statement_timestamp() - ($2 * interval '1 day')
         )
     )
     AND NOT EXISTS (
         SELECT 1 FROM match_events dismissal
         WHERE dismissal.actor_user_id=source.user_id
           AND dismissal.candidate_type='startup' AND dismissal.candidate_startup_id=startup.id
           AND dismissal.event_type='dismiss'
       )
     ORDER BY startup.id`,
    [mentorUserId, CONNECTION_DECLINE_COOLDOWN_DAYS],
  );
  return result.rows.map((row) => row.candidate_id);
}
