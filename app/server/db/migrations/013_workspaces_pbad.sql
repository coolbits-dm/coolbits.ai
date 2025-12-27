-- PBAD workspaces (system + custom)
CREATE TABLE IF NOT EXISTS workspaces (
  owner_id VARCHAR(64) NOT NULL,
  id VARCHAR(64) NOT NULL,
  workspace_type VARCHAR(16) NOT NULL CHECK (workspace_type IN ('system', 'custom')),
  system_kind VARCHAR(16) NULL CHECK (system_kind IN ('personal', 'business', 'agency', 'dev')),
  slug VARCHAR(64) NOT NULL,
  name TEXT NOT NULL,
  is_deletable BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_workspaces_owner_slug
  ON workspaces (owner_id, slug);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_workspaces_owner_system_kind
  ON workspaces (owner_id, system_kind)
  WHERE workspace_type = 'system';

CREATE INDEX IF NOT EXISTS idx_workspaces_owner_created
  ON workspaces (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner_type
  ON workspaces (owner_id, workspace_type, created_at DESC);
