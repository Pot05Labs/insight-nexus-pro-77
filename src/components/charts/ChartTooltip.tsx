import { fmtZAR } from "@/hooks/useSellOutData";

interface PayloadEntry {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

interface Props {
  active?: boolean;
  payload?: PayloadEntry[];
  label?: string;
  /** Custom value formatter. Defaults to fmtZAR. */
  formatter?: (value: number, name: string) => string;
  /** Custom label (header) formatter. */
  labelFormatter?: (label: string) => string;
}

const PremiumChartTooltip = ({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: Props) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-border/50 rounded-xl shadow-xl px-3.5 py-2.5 text-xs min-w-[150px]">
      {label != null && label !== "" && (
        <p className="text-muted-foreground font-medium mb-1.5 pb-1.5 border-b border-border/30 text-[11px]">
          {labelFormatter ? labelFormatter(String(label)) : String(label)}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}</span>
            </div>
            <span className="font-semibold text-foreground tabular-nums">
              {formatter
                ? formatter(Number(entry.value), entry.name)
                : fmtZAR(Number(entry.value))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PremiumChartTooltip;
