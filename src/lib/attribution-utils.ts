/**
 * Campaign Attribution utilities for Level 2.
 * Matches campaign flight dates to sell-out lift windows
 * and calculates incremental revenue.
 */

import type { SellOutRow } from "@/hooks/useSellOutData";

export interface CampaignFlight {
  campaign_name: string;
  platform: string;
  flight_start: string;
  flight_end: string;
  spend: number;
  /** Optional brand for scoping attribution to matching sell-out data */
  brand?: string;
}

export interface AttributionResult {
  campaign_name: string;
  platform: string;
  flight_start: string;
  flight_end: string;
  spend: number;
  /** Revenue during the pre-campaign baseline window */
  baselineRevenue: number;
  /** Revenue during the campaign flight */
  flightRevenue: number;
  /** Revenue during the post-campaign tail window */
  postRevenue: number;
  /** Days in the pre window */
  preDays: number;
  /** Days in the flight */
  flightDays: number;
  /** Days in the post window */
  postDays: number;
  /** Average daily baseline revenue */
  dailyBaseline: number;
  /** Incremental revenue = flightRevenue - (dailyBaseline * flightDays) */
  incrementalRevenue: number;
  /** Lift percentage vs baseline */
  liftPct: number;
  /** Incremental ROAS = incrementalRevenue / spend */
  incrementalROAS: number;
}

/**
 * For each campaign flight, calculate attribution by comparing sell-out data
 * during pre/during/post windows.
 *
 * Pre-window: same duration as flight, immediately before flight_start.
 * Post-window: 7 days after flight_end (tail effect).
 *
 * @param brands Optional brand filter — when provided, only sell-out rows
 *   matching these brands are used for revenue aggregation. This prevents
 *   a campaign for Brand A from being attributed lift from Brand B's revenue.
 */
export function computeCampaignAttribution(
  campaigns: CampaignFlight[],
  sellOut: SellOutRow[],
  brands?: string[],
): AttributionResult[] {
  // Filter sell-out to relevant brands if provided, so a Cadbury campaign
  // does not get credited with Nestle revenue on the same day.
  const relevantSellOut = brands?.length
    ? sellOut.filter(
        (r) =>
          r.brand &&
          brands.some((b) =>
            r.brand!.toLowerCase().includes(b.toLowerCase()),
          ),
      )
    : sellOut;

  // Group sell-out by date for fast lookup
  const revenueByDate: Record<string, number> = {};
  for (const row of relevantSellOut) {
    if (!row.date) continue;
    const d = row.date.slice(0, 10);
    revenueByDate[d] = (revenueByDate[d] ?? 0) + Number(row.revenue ?? 0);
  }

  // Deduplicate campaigns by name (aggregate spend)
  const flightMap = new Map<string, CampaignFlight>();
  for (const c of campaigns) {
    const key = c.campaign_name;
    const existing = flightMap.get(key);
    if (!existing) {
      flightMap.set(key, { ...c });
    } else {
      existing.spend += c.spend;
      if (c.flight_start < existing.flight_start) existing.flight_start = c.flight_start;
      if (c.flight_end > existing.flight_end) existing.flight_end = c.flight_end;
    }
  }

  const results: AttributionResult[] = [];

  for (const flight of flightMap.values()) {
    if (!flight.flight_start) continue;

    const start = new Date(flight.flight_start);
    const end = flight.flight_end ? new Date(flight.flight_end) : new Date(flight.flight_start);
    const flightDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);

    // Pre-window: same duration before flight start
    const preDays = flightDays;
    const preStart = new Date(start);
    preStart.setDate(preStart.getDate() - preDays);

    // Post-window: 7 days after flight end
    const postDays = 7;
    const postEnd = new Date(end);
    postEnd.setDate(postEnd.getDate() + postDays);

    // Sum revenue in each window
    const baselineRevenue = sumRevenue(revenueByDate, preStart, new Date(start.getTime() - 86400000));
    const flightRevenue = sumRevenue(revenueByDate, start, end);
    const postRevenue = sumRevenue(revenueByDate, new Date(end.getTime() + 86400000), postEnd);

    const dailyBaseline = preDays > 0 ? baselineRevenue / preDays : 0;
    const expectedFlightRevenue = dailyBaseline * flightDays;
    const incrementalRevenue = flightRevenue - expectedFlightRevenue;
    const liftPct = expectedFlightRevenue > 0 ? (incrementalRevenue / expectedFlightRevenue) * 100 : 0;
    const incrementalROAS = flight.spend > 0 ? incrementalRevenue / flight.spend : 0;

    results.push({
      campaign_name: flight.campaign_name,
      platform: flight.platform,
      flight_start: flight.flight_start,
      flight_end: flight.flight_end,
      spend: flight.spend,
      baselineRevenue: Math.round(baselineRevenue),
      flightRevenue: Math.round(flightRevenue),
      postRevenue: Math.round(postRevenue),
      preDays,
      flightDays,
      postDays,
      dailyBaseline: Math.round(dailyBaseline),
      incrementalRevenue: Math.round(incrementalRevenue),
      liftPct,
      incrementalROAS,
    });
  }

  return results.sort((a, b) => b.incrementalRevenue - a.incrementalRevenue);
}

function sumRevenue(byDate: Record<string, number>, start: Date, end: Date): number {
  let total = 0;
  const current = new Date(start);
  while (current <= end) {
    const key = current.toISOString().slice(0, 10);
    total += byDate[key] ?? 0;
    current.setDate(current.getDate() + 1);
  }
  return total;
}
