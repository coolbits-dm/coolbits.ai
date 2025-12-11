-- Create ga4_connections table
CREATE TABLE IF NOT EXISTS ga4_connections (
  id SERIAL PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(128),
  property_id VARCHAR(64),
  refresh_token TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ga4_conn_workspace_user
  ON ga4_connections (workspace_id, user_id);
