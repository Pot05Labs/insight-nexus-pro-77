/**
 * Anomaly Detection utilities for Level 2.
 * Uses statistical methods (z-score, IQR) to flag unusual
 * spikes or drops in time-series data.
 */

export interface AnomalyPoint {
  date: string;
  value: number;
  mean: number;
  stdDev: number;
  zScore: number;
  type: "spike" | "drop" | "normal";
  severity: "high" | "medium" | "low";
  /** Human-readable description */
  description: string;
}

export interface AnomalyResult {
  anomalies: AnomalyPoint[];
  mean: number;
  stdDev: number;
  totalPoints: number;
}

/**
 * Detect anomalies in a time series using z-score method.
 * @param series Array of { date, value } sorted by date
 * @param metric Name of the metric for descriptions (e.g. "revenue", "units")
 * @param zThreshold z-score threshold for anomaly detection (default 2.0)
 */
export function detectAnomalies(
  series: { date: string; value: number }[],
  metric: string,
  zThreshold = 2.0,
): AnomalyResult {
  if (series.length < 3) {
    return { anomalies: [], mean: 0, stdDev: 0, totalPoints: series.length };
  }

  const values = series.map((s) => s.value);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    return { anomalies: [], mean, stdDev, totalPoints: series.length };
  }

  const anomalies: AnomalyPoint[] = [];

  for (const point of series) {
    const zScore = (point.value - mean) / stdDev;
    const absZ = Math.abs(zScore);

    if (absZ >= zThreshold) {
      const type = zScore > 0 ? "spike" : "drop";
      const severity = absZ >= 3 ? "high" : absZ >= 2.5 ? "medium" : "low";
      const pctDiff = mean !== 0 ? ((point.value - mean) / mean) * 100 : 0;
      const direction = type === "spike" ? "above" : "below";

      anomalies.push({
        date: point.date,
        value: point.value,
        mean,
        stdDev,
        zScore,
        type,
        severity,
        description: `${metric} on ${point.date} was ${Math.abs(pctDiff).toFixed(0)}% ${direction} average (${formatValue(point.value)} vs avg ${formatValue(mean)})`,
      });
    }
  }

  return { anomalies, mean, stdDev, totalPoints: series.length };
}

/**
 * Detect anomalies using IQR (Interquartile Range) method.
 * More robust to outliers than z-score.
 */
export function detectAnomaliesIQR(
  series: { date: string; value: number }[],
  metric: string,
  multiplier = 1.5,
): AnomalyResult {
  if (series.length < 4) {
    return { anomalies: [], mean: 0, stdDev: 0, totalPoints: series.length };
  }

  const values = series.map((s) => s.value);
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - multiplier * iqr;
  const upper = q3 + multiplier * iqr;

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  const anomalies: AnomalyPoint[] = [];

  for (const point of series) {
    if (point.value < lower || point.value > upper) {
      const type = point.value > upper ? "spike" : "drop";
      const zScore = stdDev > 0 ? (point.value - mean) / stdDev : 0;
      const severity = Math.abs(zScore) >= 3 ? "high" : Math.abs(zScore) >= 2.5 ? "medium" : "low";
      const pctDiff = mean !== 0 ? ((point.value - mean) / mean) * 100 : 0;
      const direction = type === "spike" ? "above" : "below";

      anomalies.push({
        date: point.date,
        value: point.value,
        mean,
        stdDev,
        zScore,
        type,
        severity,
        description: `${metric} on ${point.date} was ${Math.abs(pctDiff).toFixed(0)}% ${direction} average (${formatValue(point.value)} vs avg ${formatValue(mean)})`,
      });
    }
  }

  return { anomalies, mean, stdDev, totalPoints: series.length };
}

/**
 * Build a daily time series from sell-out data.
 */
export function buildDailyRevenueSeries(
  data: { date: string | null; revenue: number | null }[],
): { date: string; value: number }[] {
  const byDate: Record<string, number> = {};
  for (const r of data) {
    if (!r.date) continue;
    const d = r.date.slice(0, 10);
    byDate[d] = (byDate[d] ?? 0) + Number(r.revenue ?? 0);
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

export function buildDailyUnitsSeries(
  data: { date: string | null; units_sold: number | null }[],
): { date: string; value: number }[] {
  const byDate: Record<string, number> = {};
  for (const r of data) {
    if (!r.date) continue;
    const d = r.date.slice(0, 10);
    byDate[d] = (byDate[d] ?? 0) + Number(r.units_sold ?? 0);
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

function formatValue(v: number): string {
  if (v >= 1_000_000) return `R${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R${(v / 1_000).toFixed(1)}K`;
  return `R${v.toFixed(0)}`;
}
