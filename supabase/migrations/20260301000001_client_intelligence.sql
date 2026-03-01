-- Client Intelligence Engine: stores learned patterns per project
-- Intelligence compounds with each upload — AI gets smarter over time

CREATE TABLE IF NOT EXISTS client_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  project_id UUID REFERENCES projects(id) NOT NULL,
  intelligence_type TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  confidence FLOAT DEFAULT 0.5,
  data_points_used INT DEFAULT 0,
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Intelligence types:
-- 'data_profile'      — dataset summary (date range, retailers, brands, categories)
-- 'trend'             — growth rates, share shifts, category mix changes
-- 'anomaly_pattern'   — detected anomalies and recurrence count
-- 'entity_map'        — product alias dictionary, retailer hierarchy
-- 'seasonal_pattern'  — festive, back-to-school, Easter patterns
-- 'benchmark'         — strategic synthesis across uploads

COMMENT ON TABLE client_intelligence IS 'Stores learned intelligence per client project. Grows smarter with each upload.';

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_client_intelligence_project ON client_intelligence(project_id);
CREATE INDEX IF NOT EXISTS idx_client_intelligence_type ON client_intelligence(intelligence_type);
CREATE INDEX IF NOT EXISTS idx_client_intelligence_user ON client_intelligence(user_id);
CREATE INDEX IF NOT EXISTS idx_client_intelligence_confidence ON client_intelligence(confidence);

-- RLS: users can only access their own intelligence
ALTER TABLE client_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own intelligence"
  ON client_intelligence FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own intelligence"
  ON client_intelligence FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own intelligence"
  ON client_intelligence FOR UPDATE
  USING (auth.uid() = user_id);
