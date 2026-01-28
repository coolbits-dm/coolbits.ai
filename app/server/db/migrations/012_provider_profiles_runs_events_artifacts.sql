-- Provider profiles + runs/events/artifacts (v1)

CREATE TABLE IF NOT EXISTS provider_profiles (
  id BIGSERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  default_model TEXT NOT NULL,
  allow_web BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  response_format JSONB NOT NULL DEFAULT '{}'::jsonb,
  refusal_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  safety_profile_ver TEXT NOT NULL DEFAULT 'v1',
  prompt_envelope_ver TEXT NOT NULL DEFAULT 'v1',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_provider_profiles_ws
  ON provider_profiles (workspace_id);

CREATE INDEX IF NOT EXISTS idx_provider_profiles_provider
  ON provider_profiles (provider);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NULL,
  title TEXT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS run_events (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind TEXT NOT NULL,
  actor JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL,
  hashes JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_run_events_run_seq
  ON run_events (run_id, seq);

CREATE INDEX IF NOT EXISTS idx_run_events_run
  ON run_events (run_id);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  workspace_id TEXT NOT NULL,
  client_id TEXT NULL,
  kind TEXT NOT NULL,
  content_type TEXT NOT NULL,
  uri TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artifacts_ws
  ON artifacts (workspace_id);

CREATE INDEX IF NOT EXISTS idx_artifacts_run
  ON artifacts (run_id);
