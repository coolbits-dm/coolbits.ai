-- Council briefs (token-safe prompts generated from snapshots)

CREATE TABLE IF NOT EXISTS council_briefs (
  id BIGSERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  snapshot_id BIGINT NULL,
  mode TEXT NOT NULL,
  include_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_n INTEGER NOT NULL DEFAULT 10,
  question TEXT NULL,
  prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_council_briefs_ws_user_created
  ON council_briefs (workspace_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_council_briefs_source_snapshot
  ON council_briefs (source, snapshot_id, created_at DESC);

