import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface DeltaIndicatorProps {
  delta: number | null;
  /** Label for the comparison, e.g. "vs last month" */
  label?: string;
  /** If true, a negative delta is good (e.g. CPC decreased) */
  invertColor?: boolean;
  className?: string;
}

/**
 * Shows a +/-% delta indicator with color and arrow.
 * Green = positive change (or negative if invertColor).
 * Red = negative change (or positive if invertColor).
 */
const DeltaIndicator = ({ delta, label, invertColor = false, className }: DeltaIndicatorProps) => {
  if (delta === null || delta === undefined) return null;

  const isPositive = delta > 0;
  const isNeutral = Math.abs(delta) < 0.1;

  const isGood = isNeutral ? null : invertColor ? !isPositive : isPositive;

  const colorClass = isNeutral
    ? "text-muted-foreground"
    : isGood
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";

  const bgClass = isNeutral
    ? "bg-muted/50"
    : isGood
    ? "bg-emerald-50 dark:bg-emerald-950/30"
    : "bg-red-50 dark:bg-red-950/30";

  const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;

  const formatted = `${isPositive ? "+" : ""}${delta.toFixed(1)}%`;

  return (
    <div className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5", bgClass, colorClass, className)}>
      <Icon className="h-3 w-3" />
      <span className="text-[11px] font-semibold tabular-nums">{formatted}</span>
      {label && <span className="text-[10px] font-normal opacity-70">{label}</span>}
    </div>
  );
};

export default DeltaIndicator;
