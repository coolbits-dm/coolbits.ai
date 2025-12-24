-- Ensure upsert targets exist (required for ON CONFLICT (workspace_id, user_id))
CREATE UNIQUE INDEX IF NOT EXISTS uidx_google_ads_conn_workspace_user
  ON google_ads_connections (workspace_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_ga4_conn_workspace_user
  ON ga4_connections (workspace_id, user_id);

