import { supabase } from "@/integrations/supabase/client";
import { resolveProvince } from "@/lib/sa-store-provinces";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface SellOutMetrics {
  totalRevenue: number;
  totalUnitsSold: number;
  totalUnitsSupplied: number;
  totalCost: number;
  grossMargin: number;
  grossMarginPct: number;
  revenueByRetailer: Record<string, number>;
  revenueByProduct: Record<string, number>;
  revenueByProvince: Record<string, number>;
  unitsByCategory: Record<string, number>;
  revenueTimeSeries: { date: string; revenue: number; units: number }[];
}

export interface CampaignMetrics {
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenue: number;
  avgCTR: number;
  avgCPM: number;
  avgCPC: number;
  roas: number;
  spendByPlatform: Record<string, number>;
  spendByCampaign: Record<string, number>;
  impressionsByChannel: Record<string, number>;
}

export interface ComputedMetricsResult {
  sellOut: SellOutMetrics | null;
  campaign: CampaignMetrics | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function aggregate(
  rows: Record<string, unknown>[],
  keyField: string,
  valueField: string
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    const key = String(row[keyField] ?? "Unknown");
    const val = Number(row[valueField] ?? 0);
    map[key] = (map[key] ?? 0) + val;
  }
  return map;
}

/* ------------------------------------------------------------------ */
/*  Sell-Out Metrics                                                  */
/* ------------------------------------------------------------------ */

async function computeSellOutMetrics(projectId: string): Promise<SellOutMetrics | null> {
  // Paginate with safety cap to prevent browser freezes on enterprise datasets.
  // PAGE_SIZE must be <= Supabase PostgREST max_rows (default 1000).
  const PAGE_SIZE = 1000;
  const MAX_ROWS = 10_000;
  let data: Record<string, unknown>[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: page, error } = await supabase
      .from("sell_out_data")
      .select("date, retailer, product_name_raw, region, store_location, category, revenue, units_sold, units_supplied, cost")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("[metricsEngine] sell_out fetch error at offset", offset, error.message);
      break;
    }
    const rows = (page ?? []) as Record<string, unknown>[];
    data = data.concat(rows);

    if (data.length >= MAX_ROWS) {
      console.warn(`[metricsEngine] Sell-out capped at ${MAX_ROWS} rows for metrics computation.`);
      break;
    }

    offset += PAGE_SIZE;
    hasMore = rows.length === PAGE_SIZE;
  }

  if (data.length === 0) return null;
  console.log(`[metricsEngine] Fetched ${data.length} sell-out rows for metrics`);

  const totalRevenue = data.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const totalUnitsSold = data.reduce((s, r) => s + Number(r.units_sold ?? 0), 0);
  const totalUnitsSupplied = data.reduce((s, r) => s + Number(r.units_supplied ?? 0), 0);
  const totalCost = data.reduce((s, r) => s + Number(r.cost ?? 0), 0);
  const grossMargin = totalRevenue - totalCost;
  const grossMarginPct = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0;

  const revenueByRetailer = aggregate(data, "retailer", "revenue");
  const revenueByProduct = aggregate(data, "product_name_raw", "revenue");
  const unitsByCategory = aggregate(data, "category", "units_sold");
  const revenueByProvince: Record<string, number> = {};

  for (const row of data) {
    const province = resolveProvince({
      region: typeof row.region === "string" ? row.region : null,
      storeLocation: typeof row.store_location === "string" ? row.store_location : null,
    });
    if (!province) continue;
    revenueByProvince[province] = (revenueByProvince[province] ?? 0) + Number(row.revenue ?? 0);
  }

  // Time series aggregation by date
  const tsMap = new Map<string, { revenue: number; units: number }>();
  for (const row of data) {
    const d = String(row.date ?? "");
    if (!d) continue;
    const existing = tsMap.get(d) ?? { revenue: 0, units: 0 };
    existing.revenue += Number(row.revenue ?? 0);
    existing.units += Number(row.units_sold ?? 0);
    tsMap.set(d, existing);
  }
  const revenueTimeSeries = Array.from(tsMap.entries())
    .map(([date, vals]) => ({ date, ...vals }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalRevenue,
    totalUnitsSold,
    totalUnitsSupplied,
    totalCost,
    grossMargin,
    grossMarginPct,
    revenueByRetailer,
    revenueByProduct,
    revenueByProvince,
    unitsByCategory,
    revenueTimeSeries,
  };
}

/* ------------------------------------------------------------------ */
/*  Campaign Metrics                                                  */
/* ------------------------------------------------------------------ */

async function computeCampaignMetrics(projectId: string): Promise<CampaignMetrics | null> {
  // Paginate with safety cap to prevent browser freezes on enterprise datasets.
  // PAGE_SIZE must be <= Supabase PostgREST max_rows (default 1000).
  const PAGE_SIZE = 1000;
  const MAX_ROWS = 10_000;
  let data: Record<string, unknown>[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: page, error } = await supabase
      .from("campaign_data_v2")
      .select("platform, channel, campaign_name, spend, impressions, clicks, ctr, conversions, revenue")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("campaign_name", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("[metricsEngine] campaign fetch error at offset", offset, error.message);
      break;
    }
    const rows = (page ?? []) as Record<string, unknown>[];
    data = data.concat(rows);

    if (data.length >= MAX_ROWS) {
      console.warn(`[metricsEngine] Campaign capped at ${MAX_ROWS} rows for metrics computation.`);
      break;
    }

    offset += PAGE_SIZE;
    hasMore = rows.length === PAGE_SIZE;
  }

  if (data.length === 0) return null;
  console.log(`[metricsEngine] Fetched ${data.length} campaign rows for metrics`);

  const totalSpend = data.reduce((s, r) => s + Number(r.spend ?? 0), 0);
  const totalImpressions = data.reduce((s, r) => s + Number(r.impressions ?? 0), 0);
  const totalClicks = data.reduce((s, r) => s + Number(r.clicks ?? 0), 0);
  const totalConversions = data.reduce((s, r) => s + Number(r.conversions ?? 0), 0);
  const totalRevenue = data.reduce((s, r) => s + Number(r.revenue ?? 0), 0);

  const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCPM = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  const spendByPlatform = aggregate(data, "platform", "spend");
  const spendByCampaign = aggregate(data, "campaign_name", "spend");
  const impressionsByChannel = aggregate(data, "channel", "impressions");

  return {
    totalSpend,
    totalImpressions,
    totalClicks,
    totalConversions,
    totalRevenue,
    avgCTR,
    avgCPM,
    avgCPC,
    roas,
    spendByPlatform,
    spendByCampaign,
    impressionsByChannel,
  };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Compute all metrics for a given project.
 * Queries sell_out_data and campaign_data_v2, aggregates key KPIs,
 * and optionally persists results to computed_metrics table.
 */
export async function computeMetrics(
  projectId: string,
  options?: { persist?: boolean }
): Promise<ComputedMetricsResult> {
  const [sellOut, campaign] = await Promise.all([
    computeSellOutMetrics(projectId),
    computeCampaignMetrics(projectId),
  ]);

  // Optionally persist to computed_metrics table
  if (options?.persist) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const metricsToStore: Array<{
        user_id: string;
        project_id: string;
        metric_name: string;
        metric_value: number | null;
        dimensions: Record<string, string | number> | null;
      }> = [];

      if (sellOut) {
        metricsToStore.push(
          { user_id: user.id, project_id: projectId, metric_name: "total_revenue", metric_value: sellOut.totalRevenue, dimensions: null },
          { user_id: user.id, project_id: projectId, metric_name: "total_units_sold", metric_value: sellOut.totalUnitsSold, dimensions: null },
          { user_id: user.id, project_id: projectId, metric_name: "gross_margin", metric_value: sellOut.grossMargin, dimensions: null },
          { user_id: user.id, project_id: projectId, metric_name: "gross_margin_pct", metric_value: sellOut.grossMarginPct, dimensions: null },
          { user_id: user.id, project_id: projectId, metric_name: "revenue_by_retailer", metric_value: null, dimensions: sellOut.revenueByRetailer },
          { user_id: user.id, project_id: projectId, metric_name: "revenue_by_product", metric_value: null, dimensions: sellOut.revenueByProduct },
        );
      }

      if (campaign) {
        metricsToStore.push(
          { user_id: user.id, project_id: projectId, metric_name: "total_spend", metric_value: campaign.totalSpend, dimensions: null },
          { user_id: user.id, project_id: projectId, metric_name: "roas", metric_value: campaign.roas, dimensions: null },
          { user_id: user.id, project_id: projectId, metric_name: "avg_cpm", metric_value: campaign.avgCPM, dimensions: null },
          { user_id: user.id, project_id: projectId, metric_name: "avg_cpc", metric_value: campaign.avgCPC, dimensions: null },
          { user_id: user.id, project_id: projectId, metric_name: "spend_by_platform", metric_value: null, dimensions: campaign.spendByPlatform },
        );
      }

      if (metricsToStore.length > 0) {
        // Delete previous computed metrics for this project before re-inserting
        await supabase.from("computed_metrics").delete().eq("project_id", projectId);
        await supabase.from("computed_metrics").insert(metricsToStore);
      }
    }
  }

  return { sellOut, campaign };
}
