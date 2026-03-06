/**
 * Shared chart styling utilities for consistent Recharts presentation.
 * Single source of truth for chart colors, tooltips, animations, and formatting.
 */
import type { CSSProperties } from "react";

/* ─── Tooltip ─── */
export const chartTooltipStyle: CSSProperties = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.5rem",
  fontSize: "0.75rem",
  boxShadow: "0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
  padding: "10px 14px",
};

/* ─── Cursor (the hover highlight on bars) ─── */
export const chartCursorStyle = {
  fill: "hsl(var(--muted))",
  opacity: 0.25,
};

/* ─── Accessible chart palette (8 colors, dark-mode safe, colorblind friendly) ─── */
export const CHART_COLORS = [
  "hsl(var(--primary))",       // charcoal
  "hsl(var(--chart-2))",       // amber
  "hsl(var(--chart-3))",       // purple
  "hsl(var(--chart-4))",       // rose
  "hsl(var(--chart-5))",       // blue
  "hsl(224 15% 45%)",          // slate
  "hsl(25 85% 55%)",           // orange
  "hsl(280 45% 55%)",          // violet
] as const;

/**
 * Vibrant multi-color palette for bar/area charts.
 * Each bar gets its own color via Recharts <Cell>.
 * 8 colors chosen for contrast, dark-mode safety, and harmony.
 */
export const CHART_PALETTE = [
  "#0EA5E9", // sky-500 (bright blue)
  "#8B5CF6", // violet-500 (purple)
  "#F97316", // orange-500 (warm orange)
  "#10B981", // emerald-500 (green)
  "#F43F5E", // rose-500 (pink/red)
  "#EAB308", // yellow-500 (gold)
  "#06B6D4", // cyan-500 (teal)
  "#EC4899", // pink-500 (hot pink)
] as const;

/** Donut / Pie palette — matches CHART_PALETTE for visual consistency */
export const DONUT_COLORS = [
  "#0EA5E9", // sky-500
  "#8B5CF6", // violet-500
  "#F97316", // orange-500
  "#10B981", // emerald-500
  "#F43F5E", // rose-500
  "#EAB308", // yellow-500
  "#06B6D4", // cyan-500
  "#EC4899", // pink-500
] as const;

/** Named line colors for dual/multi-axis line charts */
export const LINE_COLORS = {
  revenue: "#0EA5E9",    // sky blue
  spend: "#F43F5E",      // rose
  impressions: "#EAB308", // gold
} as const;

/* ─── Animation ─── */
export const CHART_ANIMATION_MS = 250;

/* ─── Standard heights ─── */
export const CHART_HEIGHT = {
  full: 300,
  half: 280,
  compact: 250,
} as const;

/* ─── Grid props (use spread: {...chartGridProps}) ─── */
export const chartGridProps = {
  strokeDasharray: "3 3",
  className: "stroke-border",
  vertical: false as const,
  strokeOpacity: 0.35,
};

/* ─── Axis class shorthand ─── */
export const axisClassName = "text-xs fill-muted-foreground";

/* ─── Bar corner radii ─── */
export const BAR_RADIUS = {
  vertical: [4, 4, 0, 0] as [number, number, number, number],
  horizontal: [0, 4, 4, 0] as [number, number, number, number],
} as const;

/* ─── Custom pie chart label (avoids collision on small slices) ─── */
export const renderPieLabel = ({
  name,
  percent,
}: {
  name: string;
  percent: number;
}) => {
  if (percent < 0.04) return null; // hide labels < 4%
  return `${name} ${(percent * 100).toFixed(0)}%`;
};

/**
 * Slice a sorted array to top N items, rolling up the rest into "Other".
 * Input MUST be pre-sorted descending by the value accessor.
 */
export function topNWithOther<T extends Record<string, unknown>>(
  sorted: T[],
  n: number,
  valueKey: string,
  nameKey: string,
): T[] {
  if (sorted.length <= n) return sorted;
  const top = sorted.slice(0, n);
  const otherValue = sorted.slice(n).reduce((sum, item) => sum + (Number(item[valueKey]) || 0), 0);
  if (otherValue > 0) {
    top.push({ ...sorted[0], [nameKey]: "Other", [valueKey]: Math.round(otherValue) } as T);
  }
  return top;
}
