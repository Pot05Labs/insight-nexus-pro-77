import { useMemo } from "react";
import type { SellOutRow } from "@/hooks/useSellOutData";
import type { CampaignRow } from "@/hooks/useCampaignData";

export type PeriodType = "WoW" | "MoM" | "YoY";

export interface PeriodDelta {
  current: number;
  previous: number;
  delta: number;
  deltaPct: number;
}

interface PeriodComparisonResult {
  revenue: PeriodDelta;
  units: PeriodDelta;
  aov: PeriodDelta;
  products: PeriodDelta;
  adSpend: PeriodDelta;
  impressions: PeriodDelta;
  clicks: PeriodDelta;
  conversions: PeriodDelta;
  period: PeriodType;
  currentLabel: string;
  previousLabel: string;
}

function computeDelta(current: number, previous: number): PeriodDelta {
  const delta = current - previous;
  const deltaPct = previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;
  return { current, previous, delta, deltaPct };
}

function getDateBoundaries(period: PeriodType): {
  currentStart: Date;
  currentEnd: Date;
  previousStart: Date;
  previousEnd: Date;
  currentLabel: string;
  previousLabel: string;
} {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === "WoW") {
    const dayOfWeek = today.getDay();
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - dayOfWeek);
    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);
    const previousWeekEnd = new Date(currentWeekStart);
    previousWeekEnd.setDate(previousWeekEnd.getDate() - 1);

    return {
      currentStart: currentWeekStart,
      currentEnd: today,
      previousStart: previousWeekStart,
      previousEnd: previousWeekEnd,
      currentLabel: "This Week",
      previousLabel: "Last Week",
    };
  }

  if (period === "MoM") {
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const previousMonthEnd = new Date(currentMonthStart);
    previousMonthEnd.setDate(previousMonthEnd.getDate() - 1);

    return {
      currentStart: currentMonthStart,
      currentEnd: today,
      previousStart: previousMonthStart,
      previousEnd: previousMonthEnd,
      currentLabel: today.toLocaleDateString("en-ZA", { month: "short", year: "numeric" }),
      previousLabel: previousMonthStart.toLocaleDateString("en-ZA", { month: "short", year: "numeric" }),
    };
  }

  // YoY — same month last year
  const currentYearStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const previousYearStart = new Date(today.getFullYear() - 1, today.getMonth(), 1);
  const previousYearEnd = new Date(today.getFullYear() - 1, today.getMonth() + 1, 0);

  return {
    currentStart: currentYearStart,
    currentEnd: today,
    previousStart: previousYearStart,
    previousEnd: previousYearEnd,
    currentLabel: today.toLocaleDateString("en-ZA", { month: "short", year: "numeric" }),
    previousLabel: previousYearStart.toLocaleDateString("en-ZA", { month: "short", year: "numeric" }),
  };
}

function inRange(dateStr: string | null, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

export function usePeriodComparison(
  sellOutData: SellOutRow[],
  campaignData: CampaignRow[],
  period: PeriodType = "MoM"
): PeriodComparisonResult {
  return useMemo(() => {
    const { currentStart, currentEnd, previousStart, previousEnd, currentLabel, previousLabel } = getDateBoundaries(period);

    // Sell-out splits
    const currentSellOut = sellOutData.filter((r) => inRange(r.date, currentStart, currentEnd));
    const previousSellOut = sellOutData.filter((r) => inRange(r.date, previousStart, previousEnd));

    const curRevenue = currentSellOut.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
    const prevRevenue = previousSellOut.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
    const curUnits = currentSellOut.reduce((s, r) => s + Number(r.units_sold ?? 0), 0);
    const prevUnits = previousSellOut.reduce((s, r) => s + Number(r.units_sold ?? 0), 0);
    const curProducts = new Set(currentSellOut.map((r) => r.product_name_raw).filter(Boolean)).size;
    const prevProducts = new Set(previousSellOut.map((r) => r.product_name_raw).filter(Boolean)).size;
    const curAOV = curUnits > 0 ? curRevenue / curUnits : 0;
    const prevAOV = prevUnits > 0 ? prevRevenue / prevUnits : 0;

    // Campaign splits
    const currentCampaigns = campaignData.filter((r) => inRange(r.flight_start, currentStart, currentEnd));
    const previousCampaigns = campaignData.filter((r) => inRange(r.flight_start, previousStart, previousEnd));

    const curSpend = currentCampaigns.reduce((s, r) => s + Number(r.spend ?? 0), 0);
    const prevSpend = previousCampaigns.reduce((s, r) => s + Number(r.spend ?? 0), 0);
    const curImpressions = currentCampaigns.reduce((s, r) => s + Number(r.impressions ?? 0), 0);
    const prevImpressions = previousCampaigns.reduce((s, r) => s + Number(r.impressions ?? 0), 0);
    const curClicks = currentCampaigns.reduce((s, r) => s + Number(r.clicks ?? 0), 0);
    const prevClicks = previousCampaigns.reduce((s, r) => s + Number(r.clicks ?? 0), 0);
    const curConversions = currentCampaigns.reduce((s, r) => s + Number(r.conversions ?? 0), 0);
    const prevConversions = previousCampaigns.reduce((s, r) => s + Number(r.conversions ?? 0), 0);

    return {
      revenue: computeDelta(curRevenue, prevRevenue),
      units: computeDelta(curUnits, prevUnits),
      aov: computeDelta(curAOV, prevAOV),
      products: computeDelta(curProducts, prevProducts),
      adSpend: computeDelta(curSpend, prevSpend),
      impressions: computeDelta(curImpressions, prevImpressions),
      clicks: computeDelta(curClicks, prevClicks),
      conversions: computeDelta(curConversions, prevConversions),
      period,
      currentLabel,
      previousLabel,
    };
  }, [sellOutData, campaignData, period]);
}
