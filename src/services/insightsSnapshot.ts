import type { CampaignRow } from "@/hooks/useCampaignData";
import type { SellOutRow } from "@/hooks/useSellOutData";
import { fmtZAR } from "@/hooks/useSellOutData";
import { computePeriodComparison, type PeriodComparisonResult, type PeriodType } from "@/hooks/usePeriodComparison";
import { computeCampaignAttribution, type AttributionResult, type CampaignFlight } from "@/lib/attribution-utils";
import { resolveProvince, SA_PROVINCES } from "@/lib/sa-store-provinces";

export type SummarySection = {
  key: "dashboard" | "products" | "retailers" | "geography" | "behaviour" | "campaigns";
  title: string;
  summary: string;
};

export type ExecutiveSnapshot = {
  sections: SummarySection[];
  text: string;
};

type DashboardSummaryOptions = {
  sellOutData: SellOutRow[];
  campaignData: CampaignRow[];
  periodType?: PeriodType;
  comparison?: PeriodComparisonResult;
  attributionResults?: AttributionResult[];
};

function aggregateBy<T>(rows: T[], keyFn: (row: T) => string | null | undefined, valueFn: (row: T) => number) {
  const map: Record<string, number> = {};
  for (const row of rows) {
    const key = keyFn(row)?.trim();
    if (!key) continue;
    map[key] = (map[key] ?? 0) + valueFn(row);
  }
  return map;
}

function topEntries(map: Record<string, number>, limit: number) {
  return Object.entries(map)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit);
}

function inferBrand(row: SellOutRow): string {
  if (row.brand) return row.brand;
  const name = row.product_name_raw?.trim();
  if (!name) return row.retailer ?? "Unknown";
  const firstWord = name.split(/\s+/)[0];
  return firstWord && firstWord.length > 1 ? firstWord : "Unknown";
}

function collectBrands(rows: SellOutRow[]): string[] {
  return Array.from(new Set(rows.map((row) => row.brand).filter(Boolean) as string[]));
}

function buildFlights(campaigns: CampaignRow[]): CampaignFlight[] {
  return campaigns
    .filter((campaign) => campaign.campaign_name && campaign.flight_start)
    .map((campaign) => ({
      campaign_name: campaign.campaign_name!,
      platform: campaign.platform ?? "Unknown",
      flight_start: campaign.flight_start!,
      flight_end: campaign.flight_end ?? campaign.flight_start!,
      spend: Number(campaign.spend ?? 0),
    }));
}

function buildProvinceRevenue(rows: SellOutRow[]) {
  const totals: Record<string, number> = {};

  for (const row of rows) {
    const province = resolveProvince({
      region: row.region,
      storeLocation: row.store_location,
    });
    if (!province) continue;
    totals[province] = (totals[province] ?? 0) + Number(row.revenue ?? 0);
  }

  return totals;
}

export function buildDashboardSummary({
  sellOutData,
  campaignData,
  periodType = "MoM",
  comparison,
  attributionResults,
}: DashboardSummaryOptions): SummarySection | null {
  if (sellOutData.length === 0 && campaignData.length === 0) return null;

  const totalRevenue = sellOutData.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0);
  const totalUnits = sellOutData.reduce((sum, row) => sum + Number(row.units_sold ?? 0), 0);
  const avgOrderValue = totalUnits > 0 ? totalRevenue / totalUnits : 0;
  const uniqueProducts = new Set(sellOutData.map((row) => row.product_name_raw).filter(Boolean)).size;

  const totalSpend = campaignData.reduce((sum, row) => sum + Number(row.spend ?? 0), 0);
  const totalImpressions = campaignData.reduce((sum, row) => sum + Number(row.impressions ?? 0), 0);
  const totalClicks = campaignData.reduce((sum, row) => sum + Number(row.clicks ?? 0), 0);
  const totalConversions = campaignData.reduce((sum, row) => sum + Number(row.conversions ?? 0), 0);
  const totalCampaignRevenue = campaignData.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0);
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const cps = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const roas = totalSpend > 0 && totalCampaignRevenue > 0 ? totalCampaignRevenue / totalSpend : 0;

  const brands = topEntries(aggregateBy(sellOutData, inferBrand, (row) => Number(row.revenue ?? 0)), 5)
    .map(([brand, revenue]) => `${brand} (${fmtZAR(revenue)})`)
    .join(", ");
  const categories = topEntries(aggregateBy(sellOutData, (row) => row.category ?? "Unknown", (row) => Number(row.revenue ?? 0)), 5)
    .map(([category, revenue]) => `${category} (${fmtZAR(revenue)})`)
    .join(", ");

  const comparisonData =
    comparison ??
    computePeriodComparison(sellOutData, campaignData, periodType);

  const sellOutBrands = collectBrands(sellOutData);

  const attribution =
    attributionResults ??
    computeCampaignAttribution(
      buildFlights(campaignData),
      sellOutData,
      sellOutBrands.length > 1 ? sellOutBrands : undefined,
    );

  const parts: string[] = [];

  if (sellOutData.length > 0) {
    const dates = sellOutData.map((row) => row.date).filter(Boolean) as string[];
    const dateRange = dates.length > 0 ? `${dates.sort()[0]} to ${dates.sort().at(-1)!}` : "N/A";
    parts.push(
      `Sell-out performance: Revenue ${fmtZAR(totalRevenue)}, Units ${totalUnits.toLocaleString()}, AOV ${fmtZAR(avgOrderValue)}, Unique Products ${uniqueProducts}, Date Range ${dateRange}.`,
    );
    if (brands) parts.push(`Top brands: ${brands}.`);
    if (categories) parts.push(`Category mix: ${categories}.`);
  }

  if (campaignData.length > 0) {
    parts.push(
      `Campaign performance: Spend ${fmtZAR(totalSpend)}, Impressions ${totalImpressions.toLocaleString()}, Clicks ${totalClicks.toLocaleString()}, CTR ${ctr.toFixed(2)}%, CPC ${fmtZAR(cpc)}, CPS ${fmtZAR(cps)}, ROAS ${roas.toFixed(1)}x, Conversions ${totalConversions.toLocaleString()}, Campaign Revenue ${fmtZAR(totalCampaignRevenue)}.`,
    );
  }

  if (attribution.length > 0) {
    parts.push(
      `Attribution winners: ${attribution
        .slice(0, 3)
        .map(
          (row) =>
            `${row.campaign_name} (${row.platform}) ${fmtZAR(row.incrementalRevenue)} incremental revenue, ${row.liftPct.toFixed(1)}% lift, ${row.incrementalROAS.toFixed(1)}x iROAS`,
        )
        .join("; ")}.`,
    );
  }

  if (comparisonData.revenue.deltaPct !== 0 || comparisonData.units.deltaPct !== 0 || comparisonData.aov.deltaPct !== 0) {
    parts.push(
      `${periodType} comparison: Revenue ${comparisonData.revenue.deltaPct > 0 ? "+" : ""}${comparisonData.revenue.deltaPct.toFixed(1)}%, Units ${comparisonData.units.deltaPct > 0 ? "+" : ""}${comparisonData.units.deltaPct.toFixed(1)}%, AOV ${comparisonData.aov.deltaPct > 0 ? "+" : ""}${comparisonData.aov.deltaPct.toFixed(1)}%.`,
    );
  }

  return { key: "dashboard", title: "Dashboard", summary: parts.join(" ") };
}

export function buildProductsSummary(sellOutData: SellOutRow[]): SummarySection | null {
  if (sellOutData.length === 0) return null;

  const totalRevenue = sellOutData.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0);
  const topProducts = topEntries(
    aggregateBy(sellOutData, (row) => row.product_name_raw ?? "Unknown", (row) => Number(row.revenue ?? 0)),
    10,
  );
  const categories = topEntries(
    aggregateBy(sellOutData, (row) => row.category ?? "Unknown", (row) => Number(row.revenue ?? 0)),
    5,
  );
  const brands = topEntries(
    aggregateBy(sellOutData, inferBrand, (row) => Number(row.revenue ?? 0)),
    5,
  );

  const topProductShare =
    totalRevenue > 0 && topProducts[0] ? ((topProducts[0][1] / totalRevenue) * 100).toFixed(1) : "0.0";

  return {
    key: "products",
    title: "Products",
    summary:
      `Top products: ${topProducts.map(([name, revenue]) => `${name} (${fmtZAR(revenue)})`).join(", ")}. ` +
      `Categories: ${categories.map(([name, revenue]) => `${name} (${fmtZAR(revenue)})`).join(", ")}. ` +
      `Brand rankings: ${brands
        .map(([brand, revenue]) => `${brand} (${fmtZAR(revenue)}, ${totalRevenue > 0 ? ((revenue / totalRevenue) * 100).toFixed(1) : "0.0"}% share)`)
        .join(", ")}. ` +
      `Revenue concentration: top product contributes ${topProductShare}% of total product revenue.`,
  };
}

export function buildRetailersSummary(sellOutData: SellOutRow[]): SummarySection | null {
  if (sellOutData.length === 0) return null;

  const revenueByRetailer = aggregateBy(sellOutData, (row) => row.retailer ?? "Unknown", (row) => Number(row.revenue ?? 0));
  const totalRevenue = Object.values(revenueByRetailer).reduce((sum, value) => sum + value, 0);
  const retailers = topEntries(revenueByRetailer, 5);
  const storeCounts: Record<string, Set<string>> = {};

  for (const row of sellOutData) {
    const retailer = row.retailer ?? "Unknown";
    storeCounts[retailer] ??= new Set<string>();
    if (row.store_location) storeCounts[retailer].add(row.store_location);
  }

  const avgRevenue = retailers.length > 0 ? Object.values(revenueByRetailer).reduce((sum, value) => sum + value, 0) / Object.keys(revenueByRetailer).length : 1;

  return {
    key: "retailers",
    title: "Retailers",
    summary:
      `Retailers: ${retailers
        .map(([retailer, revenue]) => `${retailer} (${fmtZAR(revenue)}, ${totalRevenue > 0 ? ((revenue / totalRevenue) * 100).toFixed(1) : "0.0"}% share)`)
        .join(", ")}. ` +
      `Store reach: ${retailers
        .map(([retailer]) => `${retailer} (${storeCounts[retailer]?.size ?? 0} stores)`)
        .join(", ")}. ` +
      `Retailer index: ${retailers
        .slice(0, 3)
        .map(([retailer, revenue]) => `${retailer} index ${Math.round((revenue / avgRevenue) * 100)}`)
        .join(", ")}.`,
  };
}

export function buildGeographySummary(sellOutData: SellOutRow[]): SummarySection | null {
  if (sellOutData.length === 0) return null;

  const storeData = topEntries(
    aggregateBy(sellOutData.filter((row) => row.store_location), (row) => row.store_location!, (row) => Number(row.revenue ?? 0)),
    5,
  );
  const provinceRevenue = topEntries(buildProvinceRevenue(sellOutData), SA_PROVINCES.length);

  if (provinceRevenue.length === 0 && storeData.length === 0) return null;

  const totalRevenue = provinceRevenue.reduce((sum, [, revenue]) => sum + revenue, 0);
  const strongest = provinceRevenue[0];

  return {
    key: "geography",
    title: "Geography",
    summary:
      `Top stores: ${storeData.map(([store, revenue]) => `${store} (${fmtZAR(revenue)})`).join(", ")}. ` +
      `Revenue by province: ${provinceRevenue.map(([province, revenue]) => `${province} (${fmtZAR(revenue)})`).join(", ")}. ` +
      (strongest
        ? `Strongest province: ${strongest[0]} at ${fmtZAR(strongest[1])}${totalRevenue > 0 ? `, ${((strongest[1] / totalRevenue) * 100).toFixed(1)}% of mapped revenue` : ""}.`
        : ""),
  };
}

export function buildBehaviourSummary(sellOutData: SellOutRow[]): SummarySection | null {
  if (sellOutData.length === 0) return null;

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const fullDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayMap: Record<string, number> = {};

  for (const row of sellOutData) {
    if (!row.date) continue;
    const day = days[new Date(row.date).getDay()];
    dayMap[day] = (dayMap[day] ?? 0) + Number(row.revenue ?? 0);
  }

  const dayData = days.map((day) => [day, dayMap[day] ?? 0] as const);
  const categoryMix = topEntries(
    aggregateBy(sellOutData, (row) => row.category ?? "Unknown", (row) => Number(row.revenue ?? 0)),
    5,
  );
  const peakDay = dayData.reduce((best, current) => (current[1] > best[1] ? current : best), dayData[0]);
  const peakLabel = fullDays[days.indexOf(peakDay[0])];

  return {
    key: "behaviour",
    title: "Behaviour",
    summary:
      `Day-of-week revenue: ${dayData.map(([day, revenue]) => `${day}: ${fmtZAR(revenue)}`).join(", ")}. ` +
      `Category mix: ${categoryMix.map(([category, revenue]) => `${category} (${fmtZAR(revenue)})`).join(", ")}. ` +
      `Peak trading day: ${peakLabel} at ${fmtZAR(peakDay[1])}.`,
  };
}

export function buildCampaignsSummary(
  sellOutData: SellOutRow[],
  campaignData: CampaignRow[],
  attributionResults?: AttributionResult[],
): SummarySection | null {
  if (campaignData.length === 0) return null;

  const totalSpend = campaignData.reduce((sum, row) => sum + Number(row.spend ?? 0), 0);
  const totalImpressions = campaignData.reduce((sum, row) => sum + Number(row.impressions ?? 0), 0);
  const totalClicks = campaignData.reduce((sum, row) => sum + Number(row.clicks ?? 0), 0);
  const totalConversions = campaignData.reduce((sum, row) => sum + Number(row.conversions ?? 0), 0);
  const totalRevenue = campaignData.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0);
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  const platformData = topEntries(
    aggregateBy(campaignData, (row) => row.platform ?? "Unknown", (row) => Number(row.spend ?? 0)),
    5,
  );

  const attribution =
    attributionResults ??
    (sellOutData.length > 0
      ? computeCampaignAttribution(
          buildFlights(campaignData),
          sellOutData,
          collectBrands(sellOutData).length > 1 ? collectBrands(sellOutData) : undefined,
        )
      : []);

  return {
    key: "campaigns",
    title: "Campaigns",
    summary:
      `Campaign performance: Spend ${fmtZAR(totalSpend)}, Impressions ${totalImpressions.toLocaleString()}, Clicks ${totalClicks.toLocaleString()}, CTR ${ctr.toFixed(2)}%, Conversions ${totalConversions.toLocaleString()}, ROAS ${roas.toFixed(1)}x. ` +
      `Platforms: ${platformData.map(([platform, spend]) => `${platform} (${fmtZAR(spend)} spend)`).join(", ")}. ` +
      (attribution.length > 0
        ? `Attribution: ${attribution
            .slice(0, 3)
            .map(
              (row) =>
                `${row.campaign_name} ${fmtZAR(row.incrementalRevenue)} incremental revenue, ${row.liftPct.toFixed(1)}% lift`,
            )
            .join("; ")}.`
        : ""),
  };
}

export function buildExecutiveSnapshot(options: {
  sellOutData: SellOutRow[];
  campaignData: CampaignRow[];
  periodType?: PeriodType;
}): ExecutiveSnapshot {
  const { sellOutData, campaignData, periodType = "MoM" } = options;
  const comparison = computePeriodComparison(sellOutData, campaignData, periodType);
  const brands = collectBrands(sellOutData);
  const attribution = sellOutData.length > 0 && campaignData.length > 0
    ? computeCampaignAttribution(
        buildFlights(campaignData),
        sellOutData,
        brands.length > 1 ? brands : undefined,
      )
    : [];

  const sections = [
    buildDashboardSummary({
      sellOutData,
      campaignData,
      periodType,
      comparison,
      attributionResults: attribution,
    }),
    buildProductsSummary(sellOutData),
    buildRetailersSummary(sellOutData),
    buildGeographySummary(sellOutData),
    buildBehaviourSummary(sellOutData),
    buildCampaignsSummary(sellOutData, campaignData, attribution),
  ].filter(Boolean) as SummarySection[];

  return {
    sections,
    text: sections.map((section) => `[${section.title.toUpperCase()}]\n${section.summary}`).join("\n\n"),
  };
}
