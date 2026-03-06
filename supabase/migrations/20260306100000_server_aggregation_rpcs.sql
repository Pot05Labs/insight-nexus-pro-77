-- =============================================================================
-- Server-Side Aggregation RPC Functions
-- =============================================================================
-- Moves dashboard aggregation from browser JavaScript to PostgreSQL.
-- All functions use SECURITY INVOKER to respect RLS policies.
-- All functions filter deleted_at IS NULL (soft-delete compliance).
-- =============================================================================

-- ─── 1. Sell-Out KPIs ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_sell_out_kpis(
  p_project_id UUID,
  p_brand TEXT DEFAULT NULL,
  p_retailer TEXT DEFAULT NULL,
  p_province TEXT DEFAULT NULL,
  p_date_from TEXT DEFAULT NULL,
  p_date_to TEXT DEFAULT NULL
)
RETURNS TABLE(
  total_revenue NUMERIC,
  total_units NUMERIC,
  total_cost NUMERIC,
  row_count BIGINT,
  distinct_products BIGINT,
  distinct_retailers BIGINT
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(s.revenue), 0)::NUMERIC AS total_revenue,
    COALESCE(SUM(s.units_sold), 0)::NUMERIC AS total_units,
    COALESCE(SUM(s.cost), 0)::NUMERIC AS total_cost,
    COUNT(*)::BIGINT AS row_count,
    COUNT(DISTINCT s.product_name_raw)::BIGINT AS distinct_products,
    COUNT(DISTINCT s.retailer)::BIGINT AS distinct_retailers
  FROM sell_out_data s
  WHERE s.project_id = p_project_id
    AND s.deleted_at IS NULL
    AND (p_brand IS NULL OR LOWER(COALESCE(s.brand, SPLIT_PART(s.product_name_raw, ' ', 1))) = LOWER(p_brand))
    AND (p_retailer IS NULL OR LOWER(s.retailer) = LOWER(p_retailer))
    AND (p_province IS NULL OR LOWER(s.region) = LOWER(p_province) OR s.region ILIKE '%' || p_province || '%')
    AND (p_date_from IS NULL OR s.date >= p_date_from)
    AND (p_date_to IS NULL OR s.date <= p_date_to);
END;
$$;

-- ─── 2. Campaign KPIs ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_campaign_kpis(
  p_project_id UUID,
  p_platform TEXT DEFAULT NULL,
  p_date_from TEXT DEFAULT NULL,
  p_date_to TEXT DEFAULT NULL
)
RETURNS TABLE(
  total_spend NUMERIC,
  total_impressions NUMERIC,
  total_clicks NUMERIC,
  total_conversions NUMERIC,
  total_revenue NUMERIC,
  campaign_count BIGINT
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(c.spend), 0)::NUMERIC AS total_spend,
    COALESCE(SUM(c.impressions), 0)::NUMERIC AS total_impressions,
    COALESCE(SUM(c.clicks), 0)::NUMERIC AS total_clicks,
    COALESCE(SUM(c.conversions), 0)::NUMERIC AS total_conversions,
    COALESCE(SUM(c.revenue), 0)::NUMERIC AS total_revenue,
    COUNT(DISTINCT c.campaign_name)::BIGINT AS campaign_count
  FROM campaign_data_v2 c
  WHERE c.project_id = p_project_id
    AND c.deleted_at IS NULL
    AND (p_platform IS NULL OR c.platform = p_platform)
    AND (p_date_from IS NULL OR c.flight_start >= p_date_from)
    AND (p_date_to IS NULL OR c.flight_start <= p_date_to);
END;
$$;

-- ─── 3. Sell-Out Aggregation (flexible GROUP BY) ────────────────────────────

CREATE OR REPLACE FUNCTION get_sell_out_aggregation(
  p_project_id UUID,
  p_group_by TEXT,
  p_brand TEXT DEFAULT NULL,
  p_retailer TEXT DEFAULT NULL,
  p_province TEXT DEFAULT NULL,
  p_date_from TEXT DEFAULT NULL,
  p_date_to TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE(
  group_key TEXT,
  total_revenue NUMERIC,
  total_units NUMERIC,
  total_cost NUMERIC,
  row_count BIGINT
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_group_expr TEXT;
BEGIN
  -- Allowlist of valid group-by columns to prevent SQL injection
  CASE p_group_by
    WHEN 'retailer' THEN v_group_expr := 'COALESCE(s.retailer, ''Unknown'')';
    WHEN 'brand' THEN v_group_expr := 'COALESCE(s.brand, SPLIT_PART(s.product_name_raw, '' '', 1))';
    WHEN 'category' THEN v_group_expr := 'COALESCE(s.category, ''Unknown'')';
    WHEN 'region' THEN v_group_expr := 'COALESCE(s.region, ''Unknown'')';
    WHEN 'store_location' THEN v_group_expr := 'COALESCE(s.store_location, ''Unknown'')';
    WHEN 'product_name_raw' THEN v_group_expr := 'COALESCE(s.product_name_raw, ''Unknown'')';
    WHEN 'date' THEN v_group_expr := 'COALESCE(s.date::TEXT, ''Unknown'')';
    WHEN 'month' THEN v_group_expr := 'COALESCE(SUBSTRING(s.date::TEXT FROM 1 FOR 7), ''Unknown'')';
    WHEN 'day_of_week' THEN v_group_expr := 'EXTRACT(DOW FROM s.date::DATE)::TEXT';
    ELSE RAISE EXCEPTION 'Invalid group_by: %. Allowed: retailer, brand, category, region, store_location, product_name_raw, date, month, day_of_week', p_group_by;
  END CASE;

  RETURN QUERY EXECUTE format(
    'SELECT
       %s AS group_key,
       COALESCE(SUM(s.revenue), 0)::NUMERIC AS total_revenue,
       COALESCE(SUM(s.units_sold), 0)::NUMERIC AS total_units,
       COALESCE(SUM(s.cost), 0)::NUMERIC AS total_cost,
       COUNT(*)::BIGINT AS row_count
     FROM sell_out_data s
     WHERE s.project_id = $1
       AND s.deleted_at IS NULL
       AND ($2 IS NULL OR LOWER(COALESCE(s.brand, SPLIT_PART(s.product_name_raw, '' '', 1))) = LOWER($2))
       AND ($3 IS NULL OR LOWER(s.retailer) = LOWER($3))
       AND ($4 IS NULL OR LOWER(s.region) = LOWER($4) OR s.region ILIKE ''%%'' || $4 || ''%%'')
       AND ($5 IS NULL OR s.date >= $5)
       AND ($6 IS NULL OR s.date <= $6)
     GROUP BY %s
     ORDER BY total_revenue DESC
     LIMIT $7',
    v_group_expr, v_group_expr
  )
  USING p_project_id, p_brand, p_retailer, p_province, p_date_from, p_date_to, p_limit;
END;
$$;

-- ─── 4. Campaign Aggregation (flexible GROUP BY) ────────────────────────────

CREATE OR REPLACE FUNCTION get_campaign_aggregation(
  p_project_id UUID,
  p_group_by TEXT,
  p_platform TEXT DEFAULT NULL,
  p_date_from TEXT DEFAULT NULL,
  p_date_to TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE(
  group_key TEXT,
  total_spend NUMERIC,
  total_impressions NUMERIC,
  total_clicks NUMERIC,
  total_conversions NUMERIC,
  total_revenue NUMERIC,
  row_count BIGINT
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_group_expr TEXT;
BEGIN
  CASE p_group_by
    WHEN 'platform' THEN v_group_expr := 'COALESCE(c.platform, ''Unknown'')';
    WHEN 'channel' THEN v_group_expr := 'COALESCE(c.channel, ''Unknown'')';
    WHEN 'campaign_name' THEN v_group_expr := 'COALESCE(c.campaign_name, ''Unknown'')';
    WHEN 'month' THEN v_group_expr := 'COALESCE(SUBSTRING(c.flight_start::TEXT FROM 1 FOR 7), ''Unknown'')';
    ELSE RAISE EXCEPTION 'Invalid group_by: %. Allowed: platform, channel, campaign_name, month', p_group_by;
  END CASE;

  RETURN QUERY EXECUTE format(
    'SELECT
       %s AS group_key,
       COALESCE(SUM(c.spend), 0)::NUMERIC AS total_spend,
       COALESCE(SUM(c.impressions), 0)::NUMERIC AS total_impressions,
       COALESCE(SUM(c.clicks), 0)::NUMERIC AS total_clicks,
       COALESCE(SUM(c.conversions), 0)::NUMERIC AS total_conversions,
       COALESCE(SUM(c.revenue), 0)::NUMERIC AS total_revenue,
       COUNT(*)::BIGINT AS row_count
     FROM campaign_data_v2 c
     WHERE c.project_id = $1
       AND c.deleted_at IS NULL
       AND ($2 IS NULL OR c.platform = $2)
       AND ($3 IS NULL OR c.flight_start >= $3)
       AND ($4 IS NULL OR c.flight_start <= $4)
     GROUP BY %s
     ORDER BY total_spend DESC
     LIMIT $5',
    v_group_expr, v_group_expr
  )
  USING p_project_id, p_platform, p_date_from, p_date_to, p_limit;
END;
$$;

-- ─── 5. Top Products with Market Share ──────────────────────────────────────

CREATE OR REPLACE FUNCTION get_top_products(
  p_project_id UUID,
  p_brand TEXT DEFAULT NULL,
  p_retailer TEXT DEFAULT NULL,
  p_province TEXT DEFAULT NULL,
  p_date_from TEXT DEFAULT NULL,
  p_date_to TEXT DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE(
  product_name TEXT,
  total_revenue NUMERIC,
  total_units NUMERIC,
  avg_price NUMERIC,
  market_share NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  WITH product_agg AS (
    SELECT
      COALESCE(s.product_name_raw, 'Unknown') AS pname,
      COALESCE(SUM(s.revenue), 0) AS rev,
      COALESCE(SUM(s.units_sold), 0) AS units
    FROM sell_out_data s
    WHERE s.project_id = p_project_id
      AND s.deleted_at IS NULL
      AND (p_brand IS NULL OR LOWER(COALESCE(s.brand, SPLIT_PART(s.product_name_raw, ' ', 1))) = LOWER(p_brand))
      AND (p_retailer IS NULL OR LOWER(s.retailer) = LOWER(p_retailer))
      AND (p_province IS NULL OR LOWER(s.region) = LOWER(p_province) OR s.region ILIKE '%' || p_province || '%')
      AND (p_date_from IS NULL OR s.date >= p_date_from)
      AND (p_date_to IS NULL OR s.date <= p_date_to)
    GROUP BY pname
  )
  SELECT
    pa.pname AS product_name,
    pa.rev::NUMERIC AS total_revenue,
    pa.units::NUMERIC AS total_units,
    CASE WHEN pa.units > 0 THEN (pa.rev / pa.units)::NUMERIC ELSE 0 END AS avg_price,
    CASE WHEN SUM(pa.rev) OVER () > 0 THEN ROUND((pa.rev / SUM(pa.rev) OVER ()) * 100, 2) ELSE 0 END AS market_share
  FROM product_agg pa
  ORDER BY pa.rev DESC
  LIMIT p_limit;
END;
$$;

-- ─── 6. Campaign Flights ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_campaign_flights(
  p_project_id UUID,
  p_platform TEXT DEFAULT NULL,
  p_date_from TEXT DEFAULT NULL,
  p_date_to TEXT DEFAULT NULL,
  p_limit INT DEFAULT 30
)
RETURNS TABLE(
  campaign_name TEXT,
  platform TEXT,
  flight_start TEXT,
  flight_end TEXT,
  total_spend NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(c.campaign_name, 'Unnamed')::TEXT AS campaign_name,
    COALESCE(c.platform, 'Unknown')::TEXT AS platform,
    MIN(c.flight_start)::TEXT AS flight_start,
    MAX(COALESCE(c.flight_end, c.flight_start))::TEXT AS flight_end,
    COALESCE(SUM(c.spend), 0)::NUMERIC AS total_spend
  FROM campaign_data_v2 c
  WHERE c.project_id = p_project_id
    AND c.deleted_at IS NULL
    AND c.flight_start IS NOT NULL
    AND (p_platform IS NULL OR c.platform = p_platform)
    AND (p_date_from IS NULL OR c.flight_start >= p_date_from)
    AND (p_date_to IS NULL OR c.flight_start <= p_date_to)
  GROUP BY c.campaign_name, c.platform
  ORDER BY MIN(c.flight_start)
  LIMIT p_limit;
END;
$$;

-- ─── 7. Filter Options ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_filter_options(
  p_project_id UUID
)
RETURNS TABLE(
  brands TEXT[],
  retailers TEXT[],
  provinces TEXT[],
  categories TEXT[],
  platforms TEXT[],
  date_min TEXT,
  date_max TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT ARRAY_AGG(DISTINCT b ORDER BY b) FROM (
      SELECT COALESCE(s.brand, SPLIT_PART(s.product_name_raw, ' ', 1)) AS b
      FROM sell_out_data s
      WHERE s.project_id = p_project_id AND s.deleted_at IS NULL
        AND COALESCE(s.brand, SPLIT_PART(s.product_name_raw, ' ', 1)) IS NOT NULL
        AND COALESCE(s.brand, SPLIT_PART(s.product_name_raw, ' ', 1)) != ''
    ) sub)::TEXT[] AS brands,
    (SELECT ARRAY_AGG(DISTINCT s.retailer ORDER BY s.retailer)
     FROM sell_out_data s WHERE s.project_id = p_project_id AND s.deleted_at IS NULL AND s.retailer IS NOT NULL
    )::TEXT[] AS retailers,
    (SELECT ARRAY_AGG(DISTINCT s.region ORDER BY s.region)
     FROM sell_out_data s WHERE s.project_id = p_project_id AND s.deleted_at IS NULL AND s.region IS NOT NULL
    )::TEXT[] AS provinces,
    (SELECT ARRAY_AGG(DISTINCT s.category ORDER BY s.category)
     FROM sell_out_data s WHERE s.project_id = p_project_id AND s.deleted_at IS NULL AND s.category IS NOT NULL
    )::TEXT[] AS categories,
    (SELECT ARRAY_AGG(DISTINCT c.platform ORDER BY c.platform)
     FROM campaign_data_v2 c WHERE c.project_id = p_project_id AND c.deleted_at IS NULL AND c.platform IS NOT NULL
    )::TEXT[] AS platforms,
    (SELECT MIN(s.date)::TEXT FROM sell_out_data s WHERE s.project_id = p_project_id AND s.deleted_at IS NULL)::TEXT AS date_min,
    (SELECT MAX(s.date)::TEXT FROM sell_out_data s WHERE s.project_id = p_project_id AND s.deleted_at IS NULL)::TEXT AS date_max;
END;
$$;

-- ─── 8. Daily Revenue (for attribution) ─────────────────────────────────────

CREATE OR REPLACE FUNCTION get_daily_revenue(
  p_project_id UUID,
  p_brand TEXT DEFAULT NULL,
  p_retailer TEXT DEFAULT NULL,
  p_province TEXT DEFAULT NULL,
  p_date_from TEXT DEFAULT NULL,
  p_date_to TEXT DEFAULT NULL
)
RETURNS TABLE(
  day TEXT,
  total_revenue NUMERIC,
  total_units NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.date::TEXT AS day,
    COALESCE(SUM(s.revenue), 0)::NUMERIC AS total_revenue,
    COALESCE(SUM(s.units_sold), 0)::NUMERIC AS total_units
  FROM sell_out_data s
  WHERE s.project_id = p_project_id
    AND s.deleted_at IS NULL
    AND s.date IS NOT NULL
    AND (p_brand IS NULL OR LOWER(COALESCE(s.brand, SPLIT_PART(s.product_name_raw, ' ', 1))) = LOWER(p_brand))
    AND (p_retailer IS NULL OR LOWER(s.retailer) = LOWER(p_retailer))
    AND (p_province IS NULL OR LOWER(s.region) = LOWER(p_province) OR s.region ILIKE '%' || p_province || '%')
    AND (p_date_from IS NULL OR s.date >= p_date_from)
    AND (p_date_to IS NULL OR s.date <= p_date_to)
  GROUP BY s.date
  ORDER BY s.date;
END;
$$;

-- ─── 9. Missing Indexes ────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_campaign_v2_platform
  ON campaign_data_v2(platform) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_v2_flight_start
  ON campaign_data_v2(flight_start) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sell_out_date
  ON sell_out_data(date) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sell_out_brand
  ON sell_out_data(brand) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sell_out_region
  ON sell_out_data(region) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sell_out_category
  ON sell_out_data(category) WHERE deleted_at IS NULL;
