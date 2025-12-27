-- Artifact storage (workspace-scoped) + attachment links

CREATE TABLE IF NOT EXISTS artifacts (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  name TEXT NULL,
  content_type TEXT NOT NULL,
  bytes BIGINT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  storage_provider VARCHAR(16) NOT NULL,
  storage_key TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_policy JSONB NULL,
  derived JSONB NULL
);

CREATE INDEX IF NOT EXISTS idx_artifacts_workspace_created
  ON artifacts (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifacts_workspace_status
  ON artifacts (workspace_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS artifact_attachments (
  id BIGSERIAL PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  artifact_id VARCHAR(64) NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  attached_to_type VARCHAR(32) NOT NULL,
  attached_to_id VARCHAR(128) NOT NULL,
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS artifact_attachments_unique
  ON artifact_attachments (artifact_id, attached_to_type, attached_to_id);

CREATE INDEX IF NOT EXISTS idx_artifact_attachments_workspace
  ON artifact_attachments (workspace_id, created_at DESC);
