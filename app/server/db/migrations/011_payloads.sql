-- CBPL payload storage (workspace-scoped)

CREATE TABLE IF NOT EXISTS payloads (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  name TEXT NULL,
  kind VARCHAR(32) NOT NULL,
  schema_version VARCHAR(32) NOT NULL,
  hash CHAR(64) NOT NULL,
  content_json JSONB NOT NULL,
  content_bytes BYTEA NULL,
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS payloads_workspace_hash_uq
  ON payloads (workspace_id, hash);

CREATE INDEX IF NOT EXISTS idx_payloads_workspace_created
  ON payloads (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payloads_workspace_kind_created
  ON payloads (workspace_id, kind, created_at DESC);
