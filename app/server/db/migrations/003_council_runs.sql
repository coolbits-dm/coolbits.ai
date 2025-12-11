-- Create council_runs table to track council execution usage
CREATE TABLE IF NOT EXISTS council_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  council_slug TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  cost_usd NUMERIC(12,6) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_council_runs_workspace_created
  ON council_runs (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_council_runs_workspace_slug_created
  ON council_runs (workspace_id, council_slug, created_at DESC);
