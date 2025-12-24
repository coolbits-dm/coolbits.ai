-- GA4 snapshots storage for dashboards

-- Ensure ga4_connections has property_id (older installs may not).
ALTER TABLE ga4_connections
ADD COLUMN IF NOT EXISTS property_id VARCHAR(64);

CREATE TABLE IF NOT EXISTS ga4_snapshots (
  id BIGSERIAL PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  property_id VARCHAR(64) NOT NULL,
  range_from DATE NOT NULL,
  range_to DATE NOT NULL,
  compare_from DATE NULL,
  compare_to DATE NULL,
  label TEXT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ga4_snapshots_ws_user_created
  ON ga4_snapshots (workspace_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ga4_snapshots_prop_range
  ON ga4_snapshots (property_id, range_from, range_to);

