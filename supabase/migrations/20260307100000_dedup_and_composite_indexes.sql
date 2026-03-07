-- =============================================================================
-- Fire 4: Deduplication constraint on sell_out_data
-- Fire 5: Composite indexes for faster dashboard queries
-- =============================================================================

-- ─── Fire 4: Dedup unique index ──────────────────────────────────────────────
-- Prevents duplicate transaction rows within the same project.
-- Only applies to non-deleted rows (partial index).
CREATE UNIQUE INDEX IF NOT EXISTS idx_sell_out_dedup
  ON sell_out_data (project_id, date, retailer, sku, store_location)
  WHERE deleted_at IS NULL;

-- ─── Fire 5: Composite indexes ───────────────────────────────────────────────
-- These replace the single-column partial indexes for the RPC aggregation
-- functions, giving PostgreSQL a composite leading key to avoid full scans.

CREATE INDEX IF NOT EXISTS idx_sell_out_project_date
  ON sell_out_data (project_id, date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sell_out_project_retailer
  ON sell_out_data (project_id, retailer)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sell_out_project_sku_date
  ON sell_out_data (project_id, sku, date)
  WHERE deleted_at IS NULL;

-- Campaign composite indexes
CREATE INDEX IF NOT EXISTS idx_campaign_v2_project_platform
  ON campaign_data_v2 (project_id, platform)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_v2_project_flight
  ON campaign_data_v2 (project_id, flight_start)
  WHERE deleted_at IS NULL;
