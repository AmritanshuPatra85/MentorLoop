CREATE TABLE match_explanations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_content_hash text NOT NULL,
  mentor_content_hash text NOT NULL,
  explanation text NOT NULL,
  source text NOT NULL CONSTRAINT match_explanations_source_ck CHECK (source IN ('groq', 'template')),
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX match_explanations_versions_uidx
  ON match_explanations (startup_content_hash, mentor_content_hash);
