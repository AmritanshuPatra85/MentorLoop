CREATE TABLE platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO platform_settings (key, value)
VALUES ('matching.weights', '{"semanticSimilarity":35,"domainOverlap":25,"stageFit":15,"availabilityOverlap":15,"trackRecord":10}'::jsonb)
ON CONFLICT (key) DO NOTHING;
