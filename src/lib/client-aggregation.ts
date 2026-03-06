/**
 * client-aggregation.ts — Client-side aggregation fallback
 *
 * Provides client-side KPI computation and GROUP BY aggregation
 * as a fallback when server-side RPC functions are unavailable.
 *
 * Used by dashboard pages alongside server-side hooks:
 *   const { data: rpcKpis } = useSellOutKPIs(filters);
 *   const clientKpis = useMemo(() => computeClientKPIs(filteredData), [filteredData]);
 *   const kpis = rpcKpis ?? clientKpis;
 */

import type { SellOutRow } from "@/hooks/useSellOutData";
import type { SellOutKPIs } from "@/hooks/useSellOutKPIs";
import type { SellOutAggRow } from "@/hooks/useAggregation";
import type { TopProduct } from "@/hooks/useTopProducts";
import type { CampaignRow } from "@/hooks/useCampaignData";
import type { CampaignKPIs } from "@/hooks/useCampaignKPIs";
import type { CampaignAggRow } from "@/hooks/useAggregation";

/* ── Sell-Out KPIs ──────────────────────────────────────────────────────────── */

export function computeClientKPIs(data: SellOutRow[]): SellOutKPIs {
  let total_revenue = 0;
  let total_units = 0;
  let total_cost = 0;
  const products = new Set<string>();
  const retailers = new Set<string>();

  for (const r of data) {
    total_revenue += r.revenue ?? 0;
    total_units += r.units_sold ?? 0;
    total_cost += r.cost ?? 0;
    if (r.product_name_raw) products.add(r.product_name_raw);
    if (r.retailer) retailers.add(r.retailer);
  }

  return {
    total_revenue,
    total_units,
    total_cost,
    row_count: data.length,
    distinct_products: products.size,
    distinct_retailers: retailers.size,
  };
}

/* ── Sell-Out Aggregation (GROUP BY) ────────────────────────────────────────── */

export function computeClientAgg(
  data: SellOutRow[],
  groupBy: string,
  limit = 50,
): SellOutAggRow[] {
  const map: Record<string, { revenue: number; units: number; cost: number; count: number }> = {};

  for (const r of data) {
    let key: string;
    switch (groupBy) {
      case "brand":
        key = r.brand ?? r.product_name_raw?.split(" ")[0] ?? "Unknown";
        break;
      case "category":
        key = r.category ?? "Unknown";
        break;
      case "retailer":
        key = r.retailer ?? "Unknown";
        break;
      case "region":
        key = r.region ?? "Unknown";
        break;
      case "store_location":
        key = r.store_location ?? "Unknown";
        break;
      case "product_name_raw":
        key = r.product_name_raw ?? "Unknown";
        break;
      case "month":
        key = r.date ? r.date.slice(0, 7) : "Unknown";
        break;
      case "day_of_week": {
        if (!r.date) { key = "Unknown"; break; }
        const d = new Date(r.date);
        key = isNaN(d.getTime()) ? "Unknown" : String(d.getDay());
        break;
      }
      case "date":
        key = r.date ?? "Unknown";
        break;
      default:
        key = "Unknown";
    }

    if (!map[key]) map[key] = { revenue: 0, units: 0, cost: 0, count: 0 };
    map[key].revenue += r.revenue ?? 0;
    map[key].units += r.units_sold ?? 0;
    map[key].cost += r.cost ?? 0;
    map[key].count += 1;
  }

  return Object.entries(map)
    .map(([k, v]) => ({
      group_key: k,
      total_revenue: v.revenue,
      total_units: v.units,
      total_cost: v.cost,
      row_count: v.count,
    }))
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, limit);
}

/* ── Top Products ───────────────────────────────────────────────────────────── */

export function computeClientTopProducts(
  data: SellOutRow[],
  limit = 10,
): TopProduct[] {
  const map: Record<string, { revenue: number; units: number }> = {};

  for (const r of data) {
    const key = r.product_name_raw ?? "Unknown";
    if (!map[key]) map[key] = { revenue: 0, units: 0 };
    map[key].revenue += r.revenue ?? 0;
    map[key].units += r.units_sold ?? 0;
  }

  const totalRevenue = Object.values(map).reduce((s, v) => s + v.revenue, 0);

  return Object.entries(map)
    .map(([k, v]) => ({
      product_name: k,
      total_revenue: v.revenue,
      total_units: v.units,
      avg_price: v.units > 0 ? v.revenue / v.units : 0,
      market_share: totalRevenue > 0 ? Math.round((v.revenue / totalRevenue) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, limit);
}

/* ── Campaign KPIs ──────────────────────────────────────────────────────────── */

export function computeClientCampaignKPIs(data: CampaignRow[]): CampaignKPIs {
  let total_spend = 0;
  let total_impressions = 0;
  let total_clicks = 0;
  let total_conversions = 0;
  let total_revenue = 0;
  const campaigns = new Set<string>();

  for (const r of data) {
    total_spend += Number(r.spend ?? 0);
    total_impressions += Number(r.impressions ?? 0);
    total_clicks += Number(r.clicks ?? 0);
    total_conversions += Number(r.conversions ?? 0);
    total_revenue += Number(r.revenue ?? 0);
    if (r.campaign_name) campaigns.add(r.campaign_name);
  }

  return {
    total_spend,
    total_impressions,
    total_clicks,
    total_conversions,
    total_revenue,
    campaign_count: campaigns.size,
  };
}

/* ── Campaign Aggregation (GROUP BY) ────────────────────────────────────────── */

export function computeClientCampaignAgg(
  data: CampaignRow[],
  groupBy: string,
  limit = 50,
): CampaignAggRow[] {
  const map: Record<string, { spend: number; impressions: number; clicks: number; conversions: number; revenue: number; count: number }> = {};

  for (const r of data) {
    let key: string;
    switch (groupBy) {
      case "platform":
        key = r.platform ?? "Unknown";
        break;
      case "channel":
        key = r.channel ?? "Unknown";
        break;
      case "campaign_name":
        key = r.campaign_name ?? "Unknown";
        break;
      case "month":
        key = r.flight_start ? r.flight_start.slice(0, 7) : "Unknown";
        break;
      default:
        key = "Unknown";
    }

    if (!map[key]) map[key] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, count: 0 };
    map[key].spend += Number(r.spend ?? 0);
    map[key].impressions += Number(r.impressions ?? 0);
    map[key].clicks += Number(r.clicks ?? 0);
    map[key].conversions += Number(r.conversions ?? 0);
    map[key].revenue += Number(r.revenue ?? 0);
    map[key].count += 1;
  }

  return Object.entries(map)
    .map(([k, v]) => ({
      group_key: k,
      total_spend: v.spend,
      total_impressions: v.impressions,
      total_clicks: v.clicks,
      total_conversions: v.conversions,
      total_revenue: v.revenue,
      row_count: v.count,
    }))
    .sort((a, b) => b.total_spend - a.total_spend)
    .slice(0, limit);
}
