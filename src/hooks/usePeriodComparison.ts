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

export interface PeriodComparisonResult {
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

function getDateBoundaries(period: PeriodType, referenceDate = new Date()): {
  currentStart: Date;
  currentEnd: Date;
  previousStart: Date;
  previousEnd: Date;
  currentLabel: string;
  previousLabel: string;
} {
  const now = new Date(referenceDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === "WoW") {
    const dayOfWeek = today.getDay(); // 0=Sun … 6=Sat
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - dayOfWeek);
    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);
    // Match the same number of elapsed days: if today is Wed (day 3),
    // compare Sun-Wed this week vs Sun-Wed last week
    const previousWeekEnd = new Date(previousWeekStart);
    previousWeekEnd.setDate(previousWeekStart.getDate() + dayOfWeek);

    const fmtShort = (d: Date) => d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });

    return {
      currentStart: currentWeekStart,
      currentEnd: today,
      previousStart: previousWeekStart,
      previousEnd: previousWeekEnd,
      currentLabel: `${fmtShort(currentWeekStart)} – ${fmtShort(today)}`,
      previousLabel: `${fmtShort(previousWeekStart)} – ${fmtShort(previousWeekEnd)}`,
    };
  }

  if (period === "MoM") {
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    // Match the same number of elapsed days in the previous month.
    // If today is March 4 (day 4), compare Mar 1-4 vs Feb 1-4 (not Feb 1-28).
    const elapsedDays = today.getDate(); // e.g. 4 on March 4
    const previousMonthEnd = new Date(previousMonthStart);
    previousMonthEnd.setDate(previousMonthStart.getDate() + elapsedDays - 1);
    // Clamp to last day of previous month in case current month has more days
    const lastDayPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    if (previousMonthEnd.getDate() > lastDayPrevMonth) {
      previousMonthEnd.setDate(lastDayPrevMonth);
    }

    const fmtRange = (start: Date, end: Date) => {
      const s = start.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
      const e = end.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
      return `${s} – ${e}`;
    };

    return {
      currentStart: currentMonthStart,
      currentEnd: today,
      previousStart: previousMonthStart,
      previousEnd: previousMonthEnd,
      currentLabel: fmtRange(currentMonthStart, today),
      previousLabel: fmtRange(previousMonthStart, previousMonthEnd),
    };
  }

  // YoY — same month last year, same number of elapsed days.
  // If today is March 4, 2026, compare Mar 1-4 2026 vs Mar 1-4 2025 (not full March 2025).
  const currentYearStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const previousYearStart = new Date(today.getFullYear() - 1, today.getMonth(), 1);
  const elapsedDaysYoY = today.getDate();
  const previousYearEnd = new Date(previousYearStart);
  previousYearEnd.setDate(previousYearStart.getDate() + elapsedDaysYoY - 1);
  // Clamp to last day of that month last year (handles Feb in leap vs non-leap years)
  const lastDayPrevYearMonth = new Date(today.getFullYear() - 1, today.getMonth() + 1, 0).getDate();
  if (previousYearEnd.getDate() > lastDayPrevYearMonth) {
    previousYearEnd.setDate(lastDayPrevYearMonth);
  }

  const fmtRangeYoY = (start: Date, end: Date) => {
    const s = start.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
    const e = end.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
    return `${s} – ${e}`;
  };

  return {
    currentStart: currentYearStart,
    currentEnd: today,
    previousStart: previousYearStart,
    previousEnd: previousYearEnd,
    currentLabel: fmtRangeYoY(currentYearStart, today),
    previousLabel: fmtRangeYoY(previousYearStart, previousYearEnd),
  };
}

function inRange(dateStr: string | null, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

export function computePeriodComparison(
  sellOutData: SellOutRow[],
  campaignData: CampaignRow[],
  period: PeriodType = "MoM",
  referenceDate = new Date(),
): PeriodComparisonResult {
  const { currentStart, currentEnd, previousStart, previousEnd, currentLabel, previousLabel } = getDateBoundaries(period, referenceDate);

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
}

export function usePeriodComparison(
  sellOutData: SellOutRow[],
  campaignData: CampaignRow[],
  period: PeriodType = "MoM"
): PeriodComparisonResult {
  return useMemo(() => {
    return computePeriodComparison(sellOutData, campaignData, period);
  }, [sellOutData, campaignData, period]);
}
