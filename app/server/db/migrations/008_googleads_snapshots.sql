-- Google Ads snapshots storage for dashboards

CREATE TABLE IF NOT EXISTS googleads_snapshots (
  id BIGSERIAL PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  customer_id TEXT NOT NULL, -- selected client CID
  range_from DATE NOT NULL,
  range_to DATE NOT NULL,
  compare_mode TEXT NULL,
  compare_from DATE NULL,
  compare_to DATE NULL,
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  label TEXT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_googleads_snaps_ws_user_created
  ON googleads_snapshots(workspace_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_googleads_snaps_customer_range
  ON googleads_snapshots(customer_id, range_from, range_to);

