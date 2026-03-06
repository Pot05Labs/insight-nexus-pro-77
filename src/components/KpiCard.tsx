import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import DeltaIndicator from "@/components/DeltaIndicator";
import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  loading?: boolean;
  delay?: number;
  colorClass?: string;
  delta?: number;
  /** Label for the comparison period, e.g. "vs Jan 2024" */
  periodLabel?: string;
}

const KpiCard = ({ label, value, icon: Icon, loading, delay = 0, colorClass = "bg-primary/8 text-primary", delta, periodLabel }: KpiCardProps) => {
  const [bgClass, textClass] = colorClass.includes(" ") ? colorClass.split(" ") : ["bg-primary/8", "text-primary"];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Card className="glass-card card-hover">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{label}</span>
            <div className={`h-7 w-7 rounded-md ${bgClass} flex items-center justify-center`}>
              <Icon className={`h-3.5 w-3.5 ${textClass}`} />
            </div>
          </div>
          {loading ? <Skeleton className="h-8 w-24" /> : (
            <div className="flex items-end gap-2">
              <p className="font-display text-xl font-bold">{value}</p>
              {delta !== undefined && delta !== 0 && (
                <div className="flex items-center gap-1">
                  <DeltaIndicator delta={delta} />
                  {periodLabel && (
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">vs {periodLabel}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default KpiCard;
