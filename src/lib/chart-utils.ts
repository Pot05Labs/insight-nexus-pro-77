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
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  padding: "8px 12px",
};

/* ─── Cursor (the hover highlight on bars) ─── */
export const chartCursorStyle = {
  fill: "hsl(var(--muted))",
  opacity: 0.3,
};

/* ─── Accessible chart palette (8 colors, dark-mode safe, colorblind friendly) ─── */
export const CHART_COLORS = [
  "hsl(var(--primary))",       // teal
  "hsl(var(--chart-2))",       // amber
  "hsl(var(--chart-3))",       // purple
  "hsl(var(--chart-4))",       // rose
  "hsl(var(--chart-5))",       // blue
  "hsl(175 55% 50%)",          // light teal
  "hsl(25 85% 55%)",           // orange
  "hsl(280 45% 55%)",          // violet
] as const;

/* ─── Animation ─── */
export const CHART_ANIMATION_MS = 800;

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
  strokeOpacity: 0.6,
};

/* ─── Axis class shorthand ─── */
export const axisClassName = "text-xs fill-muted-foreground";

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
