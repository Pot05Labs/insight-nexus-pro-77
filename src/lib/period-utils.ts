/**
 * Period-over-period comparison utilities for Level 2.
 * Computes date ranges for WoW, MoM, QoQ, YoY comparisons
 * and calculates deltas between two sets of KPIs.
 */

export type PeriodMode = "WoW" | "MoM" | "QoQ" | "YoY";

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

export interface PeriodRanges {
  current: DateRange;
  previous: DateRange;
}

/**
 * Given a reference date and a period mode, returns the current
 * and previous period date ranges.
 */
export function getPeriodRanges(refDate: Date, mode: PeriodMode): PeriodRanges {
  const d = new Date(refDate);

  switch (mode) {
    case "WoW": {
      // Current week (Mon–Sun containing refDate)
      const day = d.getDay();
      const diffToMon = day === 0 ? 6 : day - 1;
      const curStart = new Date(d);
      curStart.setDate(d.getDate() - diffToMon);
      curStart.setHours(0, 0, 0, 0);
      const curEnd = new Date(curStart);
      curEnd.setDate(curStart.getDate() + 6);
      curEnd.setHours(23, 59, 59, 999);

      const prevStart = new Date(curStart);
      prevStart.setDate(curStart.getDate() - 7);
      const prevEnd = new Date(curEnd);
      prevEnd.setDate(curEnd.getDate() - 7);

      return {
        current: { start: curStart, end: curEnd, label: formatRange(curStart, curEnd) },
        previous: { start: prevStart, end: prevEnd, label: formatRange(prevStart, prevEnd) },
      };
    }
    case "MoM": {
      const curStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const curEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const prevStart = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const prevEnd = new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999);

      return {
        current: { start: curStart, end: curEnd, label: formatMonth(curStart) },
        previous: { start: prevStart, end: prevEnd, label: formatMonth(prevStart) },
      };
    }
    case "QoQ": {
      const curQ = Math.floor(d.getMonth() / 3);
      const curStart = new Date(d.getFullYear(), curQ * 3, 1);
      const curEnd = new Date(d.getFullYear(), curQ * 3 + 3, 0, 23, 59, 59, 999);

      const prevQ = curQ - 1;
      const prevYear = prevQ < 0 ? d.getFullYear() - 1 : d.getFullYear();
      const prevQAdj = prevQ < 0 ? 3 : prevQ;
      const prevStart = new Date(prevYear, prevQAdj * 3, 1);
      const prevEnd = new Date(prevYear, prevQAdj * 3 + 3, 0, 23, 59, 59, 999);

      return {
        current: { start: curStart, end: curEnd, label: `Q${curQ + 1} ${curStart.getFullYear()}` },
        previous: { start: prevStart, end: prevEnd, label: `Q${prevQAdj + 1} ${prevYear}` },
      };
    }
    case "YoY": {
      const curStart = new Date(d.getFullYear(), 0, 1);
      const curEnd = new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
      const prevStart = new Date(d.getFullYear() - 1, 0, 1);
      const prevEnd = new Date(d.getFullYear() - 1, 11, 31, 23, 59, 59, 999);

      return {
        current: { start: curStart, end: curEnd, label: `${d.getFullYear()}` },
        previous: { start: prevStart, end: prevEnd, label: `${d.getFullYear() - 1}` },
      };
    }
  }
}

/**
 * Filter rows by a date range. Expects row.date as ISO string (YYYY-MM-DD).
 */
export function filterByDateRange<T extends { date: string | null }>(
  rows: T[],
  range: DateRange,
): T[] {
  const startStr = toDateStr(range.start);
  const endStr = toDateStr(range.end);
  return rows.filter((r) => {
    if (!r.date) return false;
    const d = r.date.slice(0, 10);
    return d >= startStr && d <= endStr;
  });
}

/**
 * Filter campaign rows by flight_start date range.
 */
export function filterCampaignsByDateRange<T extends { flight_start: string | null }>(
  rows: T[],
  range: DateRange,
): T[] {
  const startStr = toDateStr(range.start);
  const endStr = toDateStr(range.end);
  return rows.filter((r) => {
    if (!r.flight_start) return false;
    const d = r.flight_start.slice(0, 10);
    return d >= startStr && d <= endStr;
  });
}

/**
 * Compute the percentage delta between current and previous values.
 * Returns null if previous is zero (no comparison possible).
 */
export function computeDelta(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Find the most recent date in a dataset to use as reference.
 */
export function findLatestDate(rows: { date: string | null }[]): Date {
  let latest = "";
  for (const r of rows) {
    if (r.date && r.date > latest) latest = r.date;
  }
  return latest ? new Date(latest) : new Date();
}

/**
 * Detect the best default period mode based on data span.
 */
export function detectBestPeriodMode(rows: { date: string | null }[]): PeriodMode {
  const dates = rows.map((r) => r.date).filter(Boolean) as string[];
  if (dates.length === 0) return "MoM";
  const sorted = [...dates].sort();
  const earliest = new Date(sorted[0]);
  const latest = new Date(sorted[sorted.length - 1]);
  const spanDays = (latest.getTime() - earliest.getTime()) / 86400000;

  if (spanDays > 365) return "YoY";
  if (spanDays > 90) return "QoQ";
  if (spanDays > 14) return "MoM";
  return "WoW";
}

// --- Helpers ---

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatRange(start: Date, end: Date): string {
  const fmt = (d: Date) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatMonth(d: Date): string {
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
