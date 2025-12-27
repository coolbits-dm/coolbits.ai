ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS trace_id text;
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS requested_provider text;
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS requested_model text;
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS resolved_provider text;
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS resolved_model text;
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS routing_reason text;
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS pricing_version text;
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS fx_version text;
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS wallet_before_cbt integer;
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS wallet_after_cbt integer;
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS allowance_before_cbt integer;
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS allowance_after_cbt integer;

CREATE UNIQUE INDEX IF NOT EXISTS token_usage_trace_id_idx ON token_usage(trace_id);
