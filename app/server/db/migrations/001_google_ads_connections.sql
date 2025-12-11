-- Create google_ads_connections table
CREATE TABLE IF NOT EXISTS google_ads_connections (
  id SERIAL PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(128),
  customer_id TEXT,
  refresh_token TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_google_ads_conn_workspace_user
  ON google_ads_connections (workspace_id, user_id);
