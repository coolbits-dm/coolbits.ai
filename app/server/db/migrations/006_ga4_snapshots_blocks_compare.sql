-- Upgrade GA4 snapshots with blocks + compare mode storage

ALTER TABLE ga4_snapshots
  ADD COLUMN IF NOT EXISTS blocks JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE ga4_snapshots
  ADD COLUMN IF NOT EXISTS compare_mode TEXT NULL;

ALTER TABLE ga4_snapshots
  ADD COLUMN IF NOT EXISTS compare_from DATE NULL;

ALTER TABLE ga4_snapshots
  ADD COLUMN IF NOT EXISTS compare_to DATE NULL;

