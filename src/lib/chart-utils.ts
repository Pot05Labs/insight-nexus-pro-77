/**
 * Shared chart styling utilities for consistent Recharts presentation.
 * Single source of truth for chart colors, tooltips, animations, and formatting.
 */
import React, { type CSSProperties } from "react";

/* ─── Gradient IDs (use in <defs> + fill="url(#id)") ─── */
export const GRADIENT_IDS = {
  primary: "grad-primary",
  accent: "grad-accent",
  success: "grad-success",
  chart2: "grad-chart2",
  chart3: "grad-chart3",
  tealV: "grad-teal-v",
  tealH: "grad-teal-h",
  amberV: "grad-amber-v",
  roseV: "grad-rose-v",
  blueH: "grad-blue-h",
  purpleV: "grad-purple-v",
} as const;

/* ─── Donut / Pie palette ─── */
export const DONUT_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(175 55% 50%)",
  "hsl(25 85% 55%)",
  "hsl(280 45% 55%)",
] as const;

/**
 * Drop this inside any Recharts chart to register reusable gradients.
 * Usage: <ChartGradients /> as a child of the chart component.
 */
export const ChartGradients: React.FC = () =>
  React.createElement(
    "defs",
    null,
    // primary vertical
    React.createElement("linearGradient", { id: GRADIENT_IDS.primary, x1: "0", y1: "0", x2: "0", y2: "1" },
      React.createElement("stop", { offset: "0%", stopColor: "hsl(175 65% 42%)", stopOpacity: 0.8 }),
      React.createElement("stop", { offset: "100%", stopColor: "hsl(175 65% 32%)", stopOpacity: 0.15 })),
    // accent vertical
    React.createElement("linearGradient", { id: GRADIENT_IDS.accent, x1: "0", y1: "0", x2: "0", y2: "1" },
      React.createElement("stop", { offset: "0%", stopColor: "hsl(38 92% 50%)", stopOpacity: 0.8 }),
      React.createElement("stop", { offset: "100%", stopColor: "hsl(38 92% 50%)", stopOpacity: 0.15 })),
    // success vertical
    React.createElement("linearGradient", { id: GRADIENT_IDS.success, x1: "0", y1: "0", x2: "0", y2: "1" },
      React.createElement("stop", { offset: "0%", stopColor: "hsl(152 60% 40%)", stopOpacity: 0.8 }),
      React.createElement("stop", { offset: "100%", stopColor: "hsl(152 60% 40%)", stopOpacity: 0.15 })),
    // chart2
    React.createElement("linearGradient", { id: GRADIENT_IDS.chart2, x1: "0", y1: "0", x2: "0", y2: "1" },
      React.createElement("stop", { offset: "0%", stopColor: "hsl(38 92% 50%)", stopOpacity: 0.7 }),
      React.createElement("stop", { offset: "100%", stopColor: "hsl(38 92% 50%)", stopOpacity: 0.1 })),
    // chart3
    React.createElement("linearGradient", { id: GRADIENT_IDS.chart3, x1: "0", y1: "0", x2: "0", y2: "1" },
      React.createElement("stop", { offset: "0%", stopColor: "hsl(262 52% 47%)", stopOpacity: 0.7 }),
      React.createElement("stop", { offset: "100%", stopColor: "hsl(262 52% 47%)", stopOpacity: 0.1 })),
    // teal vertical
    React.createElement("linearGradient", { id: GRADIENT_IDS.tealV, x1: "0", y1: "0", x2: "0", y2: "1" },
      React.createElement("stop", { offset: "0%", stopColor: "hsl(175 65% 42%)", stopOpacity: 0.7 }),
      React.createElement("stop", { offset: "100%", stopColor: "hsl(175 65% 32%)", stopOpacity: 0.1 })),
    // teal horizontal
    React.createElement("linearGradient", { id: GRADIENT_IDS.tealH, x1: "0", y1: "0", x2: "1", y2: "0" },
      React.createElement("stop", { offset: "0%", stopColor: "hsl(175 65% 42%)", stopOpacity: 0.8 }),
      React.createElement("stop", { offset: "100%", stopColor: "hsl(175 65% 32%)", stopOpacity: 0.2 })),
    // amber vertical
    React.createElement("linearGradient", { id: GRADIENT_IDS.amberV, x1: "0", y1: "0", x2: "0", y2: "1" },
      React.createElement("stop", { offset: "0%", stopColor: "hsl(38 92% 50%)", stopOpacity: 0.8 }),
      React.createElement("stop", { offset: "100%", stopColor: "hsl(38 85% 45%)", stopOpacity: 0.15 })),
    // rose vertical
    React.createElement("linearGradient", { id: GRADIENT_IDS.roseV, x1: "0", y1: "0", x2: "0", y2: "1" },
      React.createElement("stop", { offset: "0%", stopColor: "hsl(349 75% 55%)", stopOpacity: 0.8 }),
      React.createElement("stop", { offset: "100%", stopColor: "hsl(349 75% 55%)", stopOpacity: 0.15 })),
    // blue horizontal
    React.createElement("linearGradient", { id: GRADIENT_IDS.blueH, x1: "0", y1: "0", x2: "1", y2: "0" },
      React.createElement("stop", { offset: "0%", stopColor: "hsl(199 80% 46%)", stopOpacity: 0.8 }),
      React.createElement("stop", { offset: "100%", stopColor: "hsl(199 80% 46%)", stopOpacity: 0.2 })),
    // purple vertical
    React.createElement("linearGradient", { id: GRADIENT_IDS.purpleV, x1: "0", y1: "0", x2: "0", y2: "1" },
      React.createElement("stop", { offset: "0%", stopColor: "hsl(262 52% 47%)", stopOpacity: 0.8 }),
      React.createElement("stop", { offset: "100%", stopColor: "hsl(262 52% 47%)", stopOpacity: 0.15 }))
  );

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
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(175 55% 50%)",
  "hsl(25 85% 55%)",
  "hsl(280 45% 55%)",
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
  if (percent < 0.04) return null;
  return `${name} ${(percent * 100).toFixed(0)}%`;
};
