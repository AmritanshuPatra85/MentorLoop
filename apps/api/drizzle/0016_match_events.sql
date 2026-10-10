CREATE TYPE match_candidate_type AS ENUM ('mentor', 'startup');
CREATE TYPE match_event_type AS ENUM ('view', 'save', 'dismiss', 'request');

CREATE TABLE match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_type match_candidate_type NOT NULL,
  candidate_mentor_id uuid REFERENCES mentor_profiles(user_id) ON DELETE CASCADE,
  candidate_startup_id uuid REFERENCES startups(id) ON DELETE CASCADE,
  event_type match_event_type NOT NULL,
  dismissal_reason text,
  connection_id uuid REFERENCES connections(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_events_candidate_kind_ck CHECK (
    (candidate_type = 'mentor' AND candidate_mentor_id IS NOT NULL AND candidate_startup_id IS NULL)
    OR (candidate_type = 'startup' AND candidate_startup_id IS NOT NULL AND candidate_mentor_id IS NULL)
  ),
  CONSTRAINT match_events_reason_ck CHECK (
    (event_type = 'dismiss' AND (dismissal_reason IS NULL OR char_length(dismissal_reason) <= 500))
    OR (event_type <> 'dismiss' AND dismissal_reason IS NULL)
  ),
  CONSTRAINT match_events_connection_ck CHECK (
    (event_type = 'request' AND connection_id IS NOT NULL)
    OR (event_type <> 'request' AND connection_id IS NULL)
  )
);

CREATE INDEX match_events_actor_created_idx ON match_events (actor_user_id, created_at);
CREATE INDEX match_events_actor_type_created_idx ON match_events (actor_user_id, event_type, created_at);
CREATE INDEX match_events_mentor_candidate_idx ON match_events (candidate_mentor_id, event_type, created_at);
CREATE INDEX match_events_startup_candidate_idx ON match_events (candidate_startup_id, event_type, created_at);
CREATE UNIQUE INDEX match_events_action_uidx
  ON match_events (actor_user_id, candidate_type, candidate_mentor_id, candidate_startup_id, event_type)
  WHERE event_type IN ('save', 'dismiss');
