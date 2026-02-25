/**
 * Shared chart styling utilities for consistent Recharts presentation.
 * Single source of truth for chart colors, tooltips, animations, gradients, and formatting.
 */
import type { CSSProperties, ReactElement } from "react";
import React from "react";

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
  "hsl(var(--primary))",       // teal
  "hsl(var(--chart-2))",       // amber
  "hsl(var(--chart-3))",       // purple
  "hsl(var(--chart-4))",       // rose
  "hsl(var(--chart-5))",       // blue
  "hsl(175 55% 50%)",          // light teal
  "hsl(25 85% 55%)",           // orange
  "hsl(280 45% 55%)",          // violet
] as const;

/* ─── Refined donut/pie palette (deeper, richer than CHART_COLORS) ─── */
export const DONUT_COLORS = [
  "hsl(175 65% 38%)",   // deep teal
  "hsl(38 85% 52%)",    // warm amber
  "hsl(262 48% 50%)",   // muted purple
  "hsl(199 75% 48%)",   // ocean blue
  "hsl(349 65% 55%)",   // soft rose
  "hsl(152 55% 42%)",   // forest green
  "hsl(25 80% 52%)",    // burnt orange
  "hsl(280 40% 52%)",   // violet
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

/* ─── SVG Gradient IDs ─── */
export const GRADIENT_IDS = {
  tealV: "grad-teal-v",
  tealH: "grad-teal-h",
  amberV: "grad-amber-v",
  blueV: "grad-blue-v",
  blueH: "grad-blue-h",
  purpleV: "grad-purple-v",
  roseV: "grad-rose-v",
} as const;

/* ─── SVG Gradient Definitions (place inside <BarChart>, <LineChart>, etc.) ─── */
export const ChartGradients = (): ReactElement =>
  React.createElement(
    "defs",
    null,
    // Teal vertical (top→bottom)
    React.createElement(
      "linearGradient",
      { id: GRADIENT_IDS.tealV, x1: "0", y1: "0", x2: "0", y2: "1" },
      React.createElement("stop", { offset: "0%", stopColor: "hsl(175 65% 50%)", stopOpacity: 0.9 }),
      React.createElement("stop", { offset: "100%", stopColor: "hsl(175 65% 32%)", stopOpacity: 1 }),
    ),
    // Teal horizontal (left→right)
    React.createElement(
      "linearGradient",
      { id: GRADIENT_IDS.tealH, x1: "0", y1: "0", x2: "1", y2: "0" },
      React.createElement("stop", { offset: "0%", stopColor: "hsl(175 65% 32%)", stopOpacity: 1 }),
      React.createElement("stop", { offset: "100%", stopColor: "hsl(175 65% 50%)", stopOpacity: 0.9 }),
    ),
    // Amber vertical
    React.createElement(
      "linearGradient",
      { id: GRADIENT_IDS.amberV, x1: "0", y1: "0", x2: "0", y2: "1" },
      React.createElement("stop", { offset: "0%", stopColor: "hsl(38 92% 60%)", stopOpacity: 0.9 }),
      React.createElement("stop", { offset: "100%", stopColor: "hsl(38 92% 45%)", stopOpacity: 1 }),
    ),
    // Blue vertical
    React.createElement(
      "linearGradient",
      { id: GRADIENT_IDS.blueV, x1: "0", y1: "0", x2: "0", y2: "1" },
      React.createElement("stop", { offset: "0%", stopColor: "hsl(199 80% 56%)", stopOpacity: 0.9 }),
      React.createElement("stop", { offset: "100%", stopColor: "hsl(199 80% 40%)", stopOpacity: 1 }),
    ),
    // Blue horizontal
    React.createElement(
      "linearGradient",
      { id: GRADIENT_IDS.blueH, x1: "0", y1: "0", x2: "1", y2: "0" },
      React.createElement("stop", { offset: "0%", stopColor: "hsl(199 80% 40%)", stopOpacity: 1 }),
      React.createElement("stop", { offset: "100%", stopColor: "hsl(199 80% 56%)", stopOpacity: 0.9 }),
    ),
    // Purple vertical
    React.createElement(
      "linearGradient",
      { id: GRADIENT_IDS.purpleV, x1: "0", y1: "0", x2: "0", y2: "1" },
      React.createElement("stop", { offset: "0%", stopColor: "hsl(262 52% 58%)", stopOpacity: 0.9 }),
      React.createElement("stop", { offset: "100%", stopColor: "hsl(262 52% 42%)", stopOpacity: 1 }),
    ),
    // Rose vertical
    React.createElement(
      "linearGradient",
      { id: GRADIENT_IDS.roseV, x1: "0", y1: "0", x2: "0", y2: "1" },
      React.createElement("stop", { offset: "0%", stopColor: "hsl(349 75% 65%)", stopOpacity: 0.9 }),
      React.createElement("stop", { offset: "100%", stopColor: "hsl(349 75% 50%)", stopOpacity: 1 }),
    ),
  );
