-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- â  Holdco Monitor â Initial Schema                                        â
-- â  Run this in Supabase SQL Editor to set up all required tables.          â
-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- âââ Products âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- Registry of all monitored products. Synced from config on each cron run.

CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  check_interval INTEGER NOT NULL DEFAULT 15,
  category    TEXT NOT NULL DEFAULT 'saas',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE products IS 'Registry of all monitored holdco products';

-- âââ Health Checks ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- Every 15-min check result is stored here. Pruned after 90 days.

CREATE TABLE IF NOT EXISTS health_checks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id        TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  status            TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'down')),
  http_status       INTEGER,
  response_time     INTEGER NOT NULL DEFAULT 0,
  ssl_days_remaining INTEGER,
  ssl_valid         BOOLEAN NOT NULL DEFAULT true,
  error_messages    TEXT[],
  checked_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by product + time
CREATE INDEX IF NOT EXISTS idx_health_checks_product_time
  ON health_checks (product_id, checked_at DESC);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_health_checks_checked_at
  ON health_checks (checked_at);

COMMENT ON TABLE health_checks IS 'Individual health check results, one per product per cron run';

-- âââ Incidents ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- Tracks outages, SSL warnings, slow periods. Open incidents have NULL resolved_at.

CREATE TABLE IF NOT EXISTS incidents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('downtime', 'ssl_expiry', 'slow_response', 'error_detected')),
  details     TEXT,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Index for finding active incidents quickly
CREATE INDEX IF NOT EXISTS idx_incidents_active
  ON incidents (product_id, type) WHERE resolved_at IS NULL;

-- Index for recent incidents listing
CREATE INDEX IF NOT EXISTS idx_incidents_started
  ON incidents (started_at DESC);

COMMENT ON TABLE incidents IS 'Incident tracking â open incidents have NULL resolved_at';

-- âââ Row Level Security âââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- Dashboard reads via anon key, writes via service role only.

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

-- Anon can read everything (public dashboard)
CREATE POLICY "Public read access" ON products
  FOR SELECT USING (true);

CREATE POLICY "Public read access" ON health_checks
  FOR SELECT USING (true);

CREATE POLICY "Public read access" ON incidents
  FOR SELECT USING (true);

-- Service role can do everything (cron writes)
CREATE POLICY "Service role full access" ON products
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON health_checks
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON incidents
  FOR ALL USING (auth.role() = 'service_role');

-- âââ Helpful Views ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

-- Current status of all products (latest check per product)
CREATE OR REPLACE VIEW product_status AS
SELECT DISTINCT ON (p.id)
  p.id,
  p.name,
  p.url,
  p.category,
  hc.status,
  hc.http_status,
  hc.response_time,
  hc.ssl_days_remaining,
  hc.checked_at,
  (SELECT COUNT(*) FROM incidents i WHERE i.product_id = p.id AND i.resolved_at IS NULL) AS active_incidents
FROM products p
LEFT JOIN health_checks hc ON hc.product_id = p.id
ORDER BY p.id, hc.checked_at DESC;

COMMENT ON VIEW product_status IS 'Quick view of latest health status per product';
